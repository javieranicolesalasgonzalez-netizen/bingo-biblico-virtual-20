'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {createHash,timingSafeEqual,randomInt,randomBytes,createHmac}=require('node:crypto');
const core=require('./src/core');
const {makeStore}=require('./src/store');
const port=Number(process.env.PORT||3000);
const pub=path.join(__dirname,'public');
const streams=new Map();
const ipHits=new Map();
function secret(name,devFile){
  if(process.env[name]) return process.env[name];
  if(process.env.NODE_ENV==='production') throw new Error('Configura '+name+' como secreto de producción.');
  const loc=path.join(__dirname,'data',devFile);
  fs.mkdirSync(path.dirname(loc),{recursive:true});
  if(!fs.existsSync(loc)) fs.writeFileSync(loc,randomBytes(20).toString('base64url'),{mode:0o600});
  return fs.readFileSync(loc,'utf8').trim();
}
const password=secret('ADMIN_PASSWORD','admin-secret');
const hash=value=>createHash('sha256').update(value).digest('hex');
const safeEqual=(a,b)=>{
  const x=Buffer.from(hash(String(a))),y=Buffer.from(hash(String(b)));
  return timingSafeEqual(x,y);
};
function signAdmin(){
  const body=Buffer.from(JSON.stringify({exp:Date.now()+12*60*60*1000,scope:'admin',r:randomBytes(8).toString('hex')})).toString('base64url');
  const sig=createHmac('sha256',password).update(body).digest('base64url');
  return body+'.'+sig;
}
function isAdmin(req){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const pair=token.split('.');if(pair.length!==2)return false;
  const sig=createHmac('sha256',password).update(pair[0]).digest('base64url');
  if(!safeEqual(sig,pair[1]))return false;
  try {const b=JSON.parse(Buffer.from(pair[0],'base64url').toString());return b.scope==='admin'&&b.exp>Date.now();}catch{return false;}
}
const toID=()=>randomBytes(8).toString('hex');
const fromAuth=req=>(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
const MAX_PLAYERS=20;
const bodyLimit=16000;
async function readBody(req){
  let text='';
  for await(const chunk of req){text+=chunk;if(text.length>bodyLimit)throw new Error('Solicitud demasiado grande.');}
  try{return JSON.parse(text||'{}');}catch{throw new Error('Datos inválidos.');}
}
function send(res,status,data){
  const body=JSON.stringify(data);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);
}
function fail(res,status,message){send(res,status,{error:message});}
function notify(code){
  const clients=streams.get(code);
  if(clients)for(const s of [...clients]){try{s.write('event: changed\ndata: {}\n\n');}catch{clients.delete(s);}}
}
function rate(req,scope,max=30){
  const ip=req.socket.remoteAddress||'?';const key=ip+':'+scope;
  const now=Date.now(),fresh=(ipHits.get(key)||[]).filter(t=>now-t<60_000);
  if(fresh.length>=max)return false;
  fresh.push(now);ipHits.set(key,fresh);return true;
}
function playerFor(room,req){
  const bearer=fromAuth(req);if(!bearer||bearer.includes('.'))return null;
  const digest=hash(bearer);
  return room.players.find(p=>p.tokenHash===digest)||null;
}
function roomCode(raw){return String(raw||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);}
function routeParts(pathname){return pathname.split('/').filter(Boolean);}
function requireRoom(state,code){const room=state.rooms[code];if(!room)throw new Error('No se encontró esa sala.');return room;}
function decorateState(room,req){return core.roomView(room,isAdmin(req)?'admin':'public',playerFor(room,req));}
function uniqueCode(rooms){
  const abc='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let attempt=0;attempt<100;attempt++){
    let s='';for(let i=0;i<6;i++)s+=abc[randomInt(abc.length)];
    if(!rooms[s])return s;
  }
  throw new Error('No se pudo generar un código de sala.');
}
function auditCsv(room){
  const quote=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
  const rows=[['Tipo','Fecha UTC','Participante','Categoría','Información']];
  for(const e of room.audit){
    const player=e.playerId?room.players.find(p=>p.id===e.playerId):null;
    rows.push([e.type,new Date(e.at).toISOString(),player?.name||'',e.cat||'',JSON.stringify(e)]);
  }
  return '\ufeff'+rows.map(r=>r.map(quote).join(';')).join('\r\n');
}
async function main(){
  const store=await makeStore();
  if(!process.env.ADMIN_PASSWORD) console.log('\n============================\n CLAVE ADMIN LOCAL: '+password+'\n============================\n');
  async function resolveExpired(code){
    const updates=await store.transact(state=>{
      const room=state.rooms[code];if(!room)return [];
      if(!room.windows.some(w=>w.status==='open'&&w.deadline<=Date.now()))return [];
      return core.settle(room);
    });
    if(updates.length)notify(code);
  }
  async function handle(req,res){
    const url=new URL(req.url,'http://localhost');
    const parts=routeParts(url.pathname);
    if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{ok:true,time:Date.now()});
    if(req.method==='GET'&&url.pathname==='/api/verses')return send(res,200,{verses:core.VERSES});
    if(req.method==='GET'&&url.pathname==='/api/stream'){
      const code=roomCode(url.searchParams.get('room'));
      if(!code)return fail(res,400,'Falta el código de sala.');
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache,no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
      res.write('retry: 3000\nevent: changed\ndata: {}\n\n');
      if(!streams.has(code))streams.set(code,new Set());streams.get(code).add(res);
      const hb=setInterval(()=>{try{res.write(': heartbeat\n\n');}catch{}},15000);
      req.on('close',()=>{clearInterval(hb);streams.get(code)?.delete(res);});return;
    }
    if(req.method==='POST'&&url.pathname==='/api/admin/login'){
      if(!rate(req,'login',12))return fail(res,429,'Demasiados intentos. Vuelve a intentarlo más tarde.');
      const body=await readBody(req);
      return safeEqual(body.password,password)?send(res,200,{token:signAdmin()}):fail(res,401,'Clave de administración incorrecta.');
    }
    if(req.method==='GET'&&url.pathname==='/api/admin/rooms'){
      if(!isAdmin(req))return fail(res,401,'Acceso de administrador requerido.');
      const rooms=await store.read(state=>Object.values(state.rooms).map(r=>({code:r.code,name:r.name,status:r.status,createdAt:r.createdAt,players:r.players.length})).sort((a,b)=>b.createdAt-a.createdAt));
      return send(res,200,{rooms});
    }
    if(req.method==='POST'&&url.pathname==='/api/admin/rooms'){
      if(!isAdmin(req))return fail(res,401,'Acceso de administrador requerido.');
      const body=await readBody(req);
      const newRoom=await store.transact(state=>{const code=uniqueCode(state.rooms);const room=core.makeRoom(body.name,code);state.rooms[code]=room;return room;});
      notify(newRoom.code);return send(res,201,{code:newRoom.code});
    }
    if(req.method==='POST'&&url.pathname==='/api/join'){
      if(!rate(req,'join',25))return fail(res,429,'Demasiados intentos de ingreso.');
      const body=await readBody(req),code=roomCode(body.room);
      const name=String(body.name||'').trim().replace(/\s+/g,' ');
      if(name.length<2||name.length>core.MAX_NAME)return fail(res,400,'Escribe un nombre de 2 a 48 caracteres.');
      const token=randomBytes(32).toString('base64url');
      const result=await store.transact(state=>{
        const room=requireRoom(state,code);
        if(room.status!=='lobby')throw new Error('Las inscripciones de esta partida ya cerraron.');
        if(room.players.length>=MAX_PLAYERS)throw new Error('Esta sala ya tiene 20 participantes, que es el máximo permitido.');
        if(room.players.some(p=>p.name.localeCompare(name,'es',{sensitivity:'base'})===0))throw new Error('Ese nombre ya está registrado. Usa el mismo dispositivo para recuperar tu cartón.');
        const p={id:toID(),name,tokenHash:hash(token),card:core.generateCard(room),marks:[],wins:[],joinedAt:Date.now()};
        room.players.push(p);room.audit.push({type:'ingreso',at:Date.now(),playerId:p.id});
        return {playerId:p.id,token,room:code};
      });
      notify(code);return send(res,201,result);
    }
    if(req.method==='GET'&&parts[0]==='api'&&parts[1]==='room'&&parts[2]){
      const code=roomCode(parts[2]);
      await resolveExpired(code);
      const result=await store.read(state=>{const room=state.rooms[code];return room?decorateState(room,req):null;});
      return result?send(res,200,result):fail(res,404,'Sala inexistente.');
    }
    if(req.method==='GET'&&parts[0]==='api'&&parts[1]==='admin'&&parts[2]==='export'&&parts[3]){
      if(!isAdmin(req))return fail(res,401,'Acceso de administrador requerido.');
      const code=roomCode(parts[3]);
      const room=await store.read(state=>state.rooms[code]);if(!room)return fail(res,404,'Sala inexistente.');
      res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="bingo-${code}.csv"`});return res.end(auditCsv(room));
    }
    if(req.method==='POST'&&parts[0]==='api'&&parts[1]==='room'&&parts[2]&&parts[3]){
      const code=roomCode(parts[2]);const action=parts[3];
      await resolveExpired(code);
      const body=await readBody(req);
      const adminActions=['start','draw','reveal','pause','resume','finish'];
      if(adminActions.includes(action)){
        if(!isAdmin(req))return fail(res,401,'Acceso de administrador requerido.');
        const result=await store.transact(state=>{
          const room=requireRoom(state,code);
          if(action==='start') return {commitment:core.start(room)};
          if(action==='draw') return {id:core.draw(room)};
          if(action==='reveal') return {opened:core.reveal(room)};
          if(action==='pause'){
            if(room.status!=='running'||room.paused||room.windows.some(w=>w.status==='open'))throw new Error('No se puede pausar durante un reclamo o fuera de la partida.');
            room.paused=true;return {paused:true};
          }
          if(action==='resume'){
            if(room.status!=='running'||!room.paused)throw new Error('La partida no está pausada.');
            room.paused=false;return {paused:false};
          }
          if(action==='finish'){core.finish(room);return {finished:true};}
        });
        notify(code);return send(res,200,result);
      }
      if(action==='mark'||action==='claim'){
        const result=await store.transact(state=>{
          const room=requireRoom(state,code),p=playerFor(room,req);
          if(!p)throw new Error('Sesión inválida. Vuelve a ingresar desde tu cartón original.');
          if(action==='mark')return {marks:core.mark(room,p,String(body.id),!!body.marked)};
          return core.claim(room,p,String(body.category));
        });
        notify(code);return send(res,200,result);
      }
    }
    if(req.method!=='GET')return fail(res,404,'Acción no encontrada.');
    const target=url.pathname==='/'?'/index.html':url.pathname;
    const absolute=path.resolve(pub,'.'+target);
    if(!absolute.startsWith(pub+path.sep)||!fs.existsSync(absolute)||!fs.statSync(absolute).isFile())return fail(res,404,'Archivo no encontrado.');
    const ext=path.extname(absolute), mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
    res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'self'; connect-src 'self' https://api.midvash.com; img-src 'self' data: https://api.qrserver.com; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'"});
    fs.createReadStream(absolute).pipe(res);
  }
  const server=http.createServer((req,res)=>Promise.resolve(handle(req,res)).catch(error=>{
    console.error('[error]',req.method,req.url,error.message);
    if(!res.headersSent)fail(res,400,error.message||'No se pudo completar la solicitud.');
  }));
  server.listen(port,'0.0.0.0',()=>console.log('Bingo Bíblico disponible en http://localhost:'+port));
  const cleanup=setInterval(async()=>{
    try{
      const rooms=await store.read(s=>Object.values(s.rooms).filter(r=>r.windows.some(w=>w.status==='open'&&w.deadline<=Date.now())).map(r=>r.code));
      for(const code of rooms)await resolveExpired(code);
      const now=Date.now();for(const [key,values] of ipHits)if(!values.some(t=>now-t<60_000))ipHits.delete(key);
    }catch(e){console.error('[settle]',e.message);}
  },750);
  cleanup.unref();
}
main().catch(err=>{console.error(err);process.exit(1);});
