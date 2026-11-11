'use strict';
const { randomInt, randomBytes, createHash } = require('node:crypto');
const { LETTERS, VERSES, VERSE_BY_ID } = require('./bible');
const MAX_NAME=48;
const RECLAMO_MS=20_000;
const categories=[...LETTERS,'FULL'];
const serial = x => JSON.stringify(x);
const hex = n => randomBytes(n).toString('hex');
const shuffle = (input, randint=randomInt) => {
  const a=[...input];
  for(let i=a.length-1;i>0;i--) {let j=randint(i+1); [a[i],a[j]]=[a[j],a[i]];}
  return a;
};
const signature = card => LETTERS.map(x=>card[x].join(',')).join('|');
const generateCard = (room,randint=randomInt) => {
  for(let tries=0; tries<200; tries++){
    const c={};
    for(const col of LETTERS) c[col]=shuffle(VERSES.filter(v=>v.col===col).map(v=>v.id),randint).slice(0,5);
    const sig=signature(c);
    if(!room.players.some(p=>signature(p.card)===sig)) return c;
  }
  throw new Error('No fue posible crear un cartón distinto.');
};
const makeRoom = (name,code) => ({
  code, name:String(name||'Bingo Bíblico').trim().slice(0,80), status:'lobby',
  createdAt:Date.now(), startedAt:null, endedAt:null, players:[], sequence:[], sequenceSalt:null, commitment:null,
  draws:[], windows:[], results:{B:null,I:null,N:null,G:null,O:null,FULL:null}, audit:[], paused:false
});
const publicDraws = room => room.draws.filter(d=>d.revealed).map(d=>({id:d.id,at:d.at,revealedAt:d.revealedAt}));
const drawnIds = room => new Set(publicDraws(room).map(d=>d.id));
function eligible(room,p,cat,needMarks=true){
  const selected=cat==='FULL'?LETTERS.flatMap(col=>p.card[col]):p.card[cat];
  const valid=drawnIds(room), marked=new Set(p.marks);
  return selected.every(id=>valid.has(id) && (!needMarks||marked.has(id)));
}
function canWinLetter(p){return !p.wins.some(w=>w!=='FULL');}
function record(room,type,extra={}){room.audit.push({type,at:Date.now(),...extra}); if(room.audit.length>1000) room.audit.splice(0,300);}
function start(room){
  if(room.status!=='lobby') throw new Error('La partida ya fue iniciada.');
  if(!room.players.length) throw new Error('Ingresa al menos un jugador antes de comenzar.');
  room.sequence=shuffle(VERSES.map(v=>v.id));room.sequenceSalt=hex(32);
  room.commitment=createHash('sha256').update(room.sequenceSalt+':'+serial(room.sequence)).digest('hex');
  room.startedAt=Date.now();room.status='running';record(room,'inicio');return room.commitment;
}
function draw(room){
  if(room.status!=='running'||room.paused) throw new Error('La partida no está activa.');
  if(room.windows.some(w=>w.status==='open')) throw new Error('Primero deben cerrarse los reclamos.');
  if(room.draws.some(d=>!d.revealed)) throw new Error('Revela la referencia anterior antes de seguir.');
  if(room.draws.length>=room.sequence.length) throw new Error('Ya se sortearon todas las referencias.');
  const id=room.sequence[room.draws.length];
  room.draws.push({id,at:Date.now(),revealed:false,revealedAt:null});record(room,'sorteo',{n:room.draws.length});
  return id;
}
function reveal(room,now=Date.now()){
  if(room.status!=='running') throw new Error('No hay una partida activa.');
  const d=room.draws.at(-1); if(!d||d.revealed) throw new Error('No hay una referencia pendiente de revelar.');
  d.revealed=true;d.revealedAt=now;
  const opened=[];
  for(const cat of categories){
    if(room.results[cat]) continue;
    const possible=room.players.some(p=>(cat==='FULL'||canWinLetter(p)) && eligible(room,p,cat,false));
    if(possible){
      const win={id:hex(8),cat,status:'open',openedAt:now,deadline:now+RECLAMO_MS,drawIndex:room.draws.length,claims:[],winnerId:null};
      room.windows.push(win);opened.push(cat);
    }
  }
  record(room,'revelar',{verse:d.id,opened});return opened;
}
function mark(room,p,id,active){
  if(room.status!=='running'||room.paused) throw new Error('El juego está pausado o finalizado.');
  if(!VERSE_BY_ID[id]) throw new Error('Referencia inválida.');
  if(!LETTERS.some(c=>p.card[c].includes(id))) throw new Error('Esta referencia no está en tu cartón.');
  if(!drawnIds(room).has(id)) throw new Error('Ese versículo aún no fue revelado.');
  const set=new Set(p.marks);
  if(active) set.add(id); else set.delete(id);
  p.marks=Array.from(set);return p.marks;
}
function claim(room,p,cat,now=Date.now()){
  if(!categories.includes(cat)) throw new Error('Categoría de premio inválida.');
  if(room.status!=='running'||room.paused) throw new Error('La partida no admite reclamos en este momento.');
  const w=room.windows.find(w=>w.cat===cat && w.status==='open' && w.deadline>now);
  if(!w) throw new Error('No existe una ventana activa para ese premio.');
  if(cat!=='FULL'&&!canWinLetter(p)) throw new Error('Ya recibiste un premio por letra.');
  if(room.results[cat]) throw new Error('Ese premio ya fue entregado.');
  if(!eligible(room,p,cat,true)) throw new Error('Debes marcar las casillas válidas de la categoría antes de reclamar.');
  if(w.claims.some(c=>c.playerId===p.id)) return {already:true};
  w.claims.push({playerId:p.id,at:now});record(room,'reclamo',{playerId:p.id,cat});return {accepted:true};
}
function settle(room,now=Date.now(),randint=randomInt){
  let updates=[];
  const expired=room.windows.filter(w=>w.status==='open' && w.deadline<=now);
  // Sortear también el orden de resolución entre letras simultáneas.
  const priorities=[...expired.filter(w=>w.cat==='FULL'),...shuffle(expired.filter(w=>w.cat!=='FULL'),randint)];
  for(const w of priorities){
    let candidates=w.claims.filter(claim=>{
      const p=room.players.find(p=>p.id===claim.playerId);
      return p && !room.results[w.cat] && (w.cat==='FULL'||canWinLetter(p)) && eligible(room,p,w.cat,true);
    });
    // Reclamos de cada jugador cuentan una sola vez.
    candidates=[...new Map(candidates.map(c=>[c.playerId,c])).values()];
    if(candidates.length){
      const chosen=candidates[randint(candidates.length)];
      const p=room.players.find(p=>p.id===chosen.playerId);
      w.winnerId=p.id;p.wins.push(w.cat);
      room.results[w.cat]={playerId:p.id,name:p.name,cardId:p.id,at:now,windowId:w.id,eligibleCount:candidates.length};
      record(room,'premio',{cat:w.cat,playerId:p.id,eligibleCount:candidates.length});
    } else record(room,'premio_sin_reclamos',{cat:w.cat});
    w.status='closed'; w.closedAt=now;updates.push(w.cat);
  }
  return updates;
}
function finish(room,now=Date.now()){
  if(room.windows.some(w=>w.status==='open')) throw new Error('Termina la ventana de reclamos antes de cerrar.');
  if(room.draws.some(d=>!d.revealed)) throw new Error('Revela la última referencia antes de cerrar.');
  room.status='finished';room.endedAt=now;record(room,'fin');
}
function roomView(room,role='public',player=null){
  const last=room.draws.at(-1)||null;
  const windows=room.windows.filter(w=>w.status==='open').map(w=>({cat:w.cat,deadline:w.deadline,openedAt:w.openedAt,claimCount:w.claims.length,claimed:!!player&&w.claims.some(c=>c.playerId===player.id)}));
  const base={code:room.code,name:room.name,status:room.status,paused:room.paused,
    playerCount:room.players.length,drawCount:room.draws.length,remaining:75-room.draws.length,
    commitment:room.commitment,draws:publicDraws(room),
    current:last?{revealed:last.revealed,id:last.revealed?last.id:null}:null,
    windows,results:room.results,
    proof:room.status==='finished'?{salt:room.sequenceSalt,sequence:room.sequence}:null};
  if(player) base.me={id:player.id,name:player.name,card:player.card,marks:player.marks,wins:player.wins};
  if(role==='admin') {
    base.players=room.players.map(p=>({id:p.id,name:p.name,marked:p.marks.length,wins:p.wins,card:p.card}));
    base.windowsAll=room.windows.map(w=>({id:w.id,cat:w.cat,status:w.status,openedAt:w.openedAt,deadline:w.deadline,closedAt:w.closedAt||null,claimCount:w.claims.length,claims:w.claims.map(c=>({name:room.players.find(p=>p.id===c.playerId)?.name,at:c.at})),winnerId:w.winnerId}));
    base.audit=room.audit.slice(-150);
  }
  return base;
}
module.exports={ LETTERS,VERSES,VERSE_BY_ID,RECLAMO_MS,MAX_NAME,shuffle,generateCard,makeRoom,start,draw,reveal,mark,claim,settle,finish,roomView,eligible,canWinLetter,hex };
