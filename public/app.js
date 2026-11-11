'use strict';
(() => {
const app=document.querySelector('#app');
const params=new URLSearchParams(location.search);
const isAdminMode=params.has('admin');
const isProjector=params.has('pantalla');
let room=(params.get('room')||params.get('s')||params.get('pantalla')||'').toUpperCase();
let auth=localStorage.getItem('bingo_admin')||'';
let view=null, rooms=[], verses={}, stream=null, polling=null, countdown=null;
const textCache={}, pendingVerse=new Set();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const letters=['B','I','N','G','O'];
const playerToken=()=>localStorage.getItem('bingo_p_'+room)||'';
const currentToken=()=>isAdminMode?auth:playerToken();
const stamp=n=>new Date(n).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
const base=()=>location.origin+location.pathname;
const link=(kind='s',id=room)=>`${base()}?${kind}=${encodeURIComponent(id)}`;
const header=()=>`<div class="topbar"><a class="brand" href="/"><span class="brand-icon">✦</span><span>BINGO BÍBLICO<br><span class="tiny muted" style="font-weight:700;letter-spacing:0">VIRTUAL</span></span></a><div class="row wrap"><span class="pill">✝ 75 versículos</span>${!isAdminMode?`<a class="btn small outline" href="/?admin=1">Administrar</a>`:`<button class="btn small outline" data-action="logout">Salir</button>`}</div></div>`;
const wrap=(content)=>`<main class="appwrap">${header()}${content}<footer class="footer">Bingo Bíblico Virtual · Marcación mixta · Sorteos seguros · Referencias Reina-Valera 1909</footer></main>`;
function toast(msg){const el=document.querySelector('#toast');el.textContent=msg;el.classList.add('active');clearTimeout(toast.id);toast.id=setTimeout(()=>el.classList.remove('active'),4200);}
async function api(path,body,method=body===undefined?'GET':'POST'){
 const opts={method,headers:{}};
 if(body!==undefined){opts.body=JSON.stringify(body);opts.headers['Content-Type']='application/json';}
 if(currentToken())opts.headers.Authorization='Bearer '+currentToken();
 const response=await fetch(path,opts);
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(result.error||`Error ${response.status}`);
 return result;
}
async function updateState(){
 if(!room)return;
 try{
   view=await api('/api/room/'+room);
   render();
   if(view.current?.revealed&&view.current.id)loadText(view.current.id);
 }catch(err){
   if(!isAdminMode){app.innerHTML=wrap(`<div class="card introbox stack"><h2>Sala no disponible</h2><p>${esc(err.message)}</p><a class="btn" href="/">Volver al inicio</a></div>`);}
   else toast(err.message);
 }
}
function watchRoom(){
 if(stream){stream.close();stream=null;}
 if(polling)clearInterval(polling);
 if(countdown)clearInterval(countdown);
 if(room){
  stream=new EventSource('/api/stream?room='+encodeURIComponent(room));
  stream.addEventListener('changed',()=>updateState());
  polling=setInterval(updateState,5500);
  countdown=setInterval(tick,250);
 }
}
function tick(){
 document.querySelectorAll('[data-deadline]').forEach(el=>{
  const remain=Math.max(0,Number(el.dataset.deadline)-Date.now());
  const sec=Math.ceil(remain/1000);
  el.textContent='00:'+String(sec).padStart(2,'0');
  el.classList.toggle('urgent',sec<=5);
 });
}
function statusPill(){
 if(view.status==='lobby')return '<span class="pill warn">● Inscripciones abiertas</span>';
 if(view.status==='finished')return '<span class="pill">● Finalizada</span>';
 if(view.paused)return '<span class="pill warn">Ⅱ Pausada</span>';
 return '<span class="pill good">● En juego</span>';
}
function cardHtml(){
 if(!view.me)return '';
 const {card,marks}=view.me,seen=new Set(view.draws.map(v=>v.id)),done=new Set(marks);
 let cells=letters.map(x=>`<div class="bingocol">${x}</div>`).join('');
 for(let row=0;row<5;row++)for(const col of letters){
   const id=card[col][row],v=verses[id],marked=done.has(id),available=seen.has(id),isPlay=view.status==='running'&&!view.paused;
   const status=marked?'marked':available?'ready':'locked';
   cells+=`<button type="button" class="cell ${status}" data-action="mark" data-id="${id}" data-current="${marked}" ${!available||!isPlay?'disabled':''} aria-label="${esc(v?.ref||id)} ${marked?'marcado':available?'disponible':'sin sortear'}"><span>${esc(v?.ref||id)}</span><span class="symbol">${marked?'✓':available?'○':'·'}</span>${available&&!marked?'<span class="hint">¡Salió!</span>':''}</button>`;
 }
 const progress=letters.map(col=>{const count=card[col].filter(id=>done.has(id)).length;return `<div class="progitem"><div class="bar"><span style="width:${count*20}%"></span></div>${col} · ${count}/5</div>`;}).join('');
 return `<section class="card stack"><div class="between row"><div><div class="eyebrow">Cartón personal</div><h2 style="margin:3px 0">${esc(view.me.name)}</h2><div class="small muted">Cartón ${esc(view.me.id.slice(0,6).toUpperCase())}</div></div><span class="pill">${marks.length}/25 marcados</span></div><div class="bingocard">${cells}</div><div class="progressrow">${progress}</div><div class="notice">Toca solo las referencias que ya salieron. Las casillas amarillas están disponibles para marcar; las rosadas ya están validadas.</div></section>`;
}
function claimHtml(){
 if(!view.windows.length)return '';
 const isPlayer=!!view.me;
 const html=view.windows.map(w=>{
  const p=view.me, ids=p?(w.cat==='FULL'?letters.flatMap(l=>p.card[l]):p.card[w.cat]):[];
  const ready=!!p&&ids.every(id=>p.marks.includes(id));
  const entitled=w.cat==='FULL'||!(p?.wins||[]).some(l=>l!=='FULL');
  const can=ready&&entitled&&!w.claimed&&view.status==='running'&&!view.paused;
  return `<div class="claimbanner stack"><div class="windowline"><div><div class="eyebrow">Premio en disputa</div><h3 style="margin:5px 0">${w.cat==='FULL'?'★ Cartón completo':'Letra '+w.cat}</h3></div><span class="timer" data-deadline="${w.deadline}">00:20</span></div>
  <p class="small" style="margin:0">${w.claimCount} reclamo(s) recibidos. Todos los válidos tendrán la misma oportunidad, sin importar quién reclamó primero.</p>
  ${isPlayer?`<button class="btn wide ${w.claimed?'green':'gold'}" data-action="claim" data-cat="${w.cat}" ${!can?'disabled':''}>${w.claimed?'✓ Reclamo registrado':ready?'🏆 ¡BINGO! Reclamar ahora':'Marca las '+(w.cat==='FULL'?'25 casillas':'5 casillas')+' para reclamar'}</button>${!entitled?'<div class="small muted">Ya recibiste un premio por letra.</div>':''}`:''}</div>`;
 }).join('');return `<section class="stack">${html}</section>`;
}
function awardsHtml(){return `<div class="stack" style="gap:8px">${[...letters,'FULL'].map(cat=>{
  const a=view.results[cat];return `<div class="award ${a?'won':''}"><span class="letter">${cat==='FULL'?'★ Cartón completo':'Letra '+cat}</span>${a?`<span class="small"><b>🏆 ${esc(a.name)}</b><br><small>${a.eligibleCount} candidato(s)</small></span>`:'<span class="small muted">Disponible</span>'}</div>`;
 }).join('')}</div>`;}
function lastVerseHtml(projector=false){
 const last=view.current,id=last?.id,v=verses[id],ref=last?.revealed?esc(v?.ref||id):last?'Referencia por revelar':'Sin sorteos todavía';
 const txt=id?textCache[id]:null;
 return `<div class="verse-panel"><div class="eyebrow">${last?.revealed?'Último versículo sorteado':last?'La ruleta se detuvo':'Ruleta bíblica'}</div><h2>${ref}</h2>${last?.revealed?(txt?`<p class="verse-text">“${esc(txt)}”</p>`:'<p class="small" style="color:#efcbd3">'+(pendingVerse.has(id)?'Cargando texto bíblico…':'Reina-Valera 1909 · Consultar en la Biblia')+'</p>'):(last?'<p class="small" style="color:#f5d9e3">El presentador debe revelar la referencia.</p>':'<p class="small" style="color:#f5d9e3">Esperando el primer giro.</p>')}</div>`;
}
function historyHtml(){
 if(!view.draws.length)return '<p class="muted small">Las referencias sorteadas aparecerán aquí.</p>';
 return `<div class="history">${[...view.draws].reverse().map((d,i)=>`<span title="Sorteo ${view.draws.length-i}">${esc(verses[d.id]?.ref||d.id)}</span>`).join('')}</div>`;
}
function playerScreen(){
 if(!view.me)return joinScreen();
 const isMine=Object.values(view.results).filter(x=>x?.playerId===view.me.id);
 app.innerHTML=wrap(`<div class="page-title"><div><div class="eyebrow">Sala ${esc(room)}</div><h1>${esc(view.name)}</h1><div class="subtitle">Hola, ${esc(view.me.name)} · ${view.playerCount} participante(s)</div></div>${statusPill()}</div>
 ${isMine.length?`<div class="success" style="margin-bottom:16px">🎉 ¡Ganaste! Premio(s): <b>${isMine.map(x=>Object.entries(view.results).find(([,r])=>r===x)?.[0]).join(', ')}</b>. Tu resultado quedó registrado.</div>`:''}
 <div class="game-grid"><div>${cardHtml()}</div><div class="stack">${lastVerseHtml()}${claimHtml()}<section class="card"><h3>🏆 Premios</h3>${awardsHtml()}</section><section class="card"><h3>Versículos sorteados</h3>${historyHtml()}</section></div></div>
 ${view.status==='finished'?proofHtml():''}`);tick();
}
function proofHtml(){
 const p=view.proof;
 return `<section class="card stack" style="margin-top:16px"><h3>Verificación del sorteo</h3><p class="small muted">El orden de los 75 versículos se fijó al iniciar la partida. Esta huella permite comprobar que no cambió durante el juego.</p><div class="linkline">Huella SHA-256: ${esc(view.commitment||'')}</div>${p?`<details><summary class="small">Consultar prueba final (sal + orden)</summary><div class="linkline">Sal: ${esc(p.salt)}<br>Orden: ${p.sequence.map(id=>esc(verses[id]?.ref||id)).join(' · ')}</div></details>`:''}</section>`;
}
function joinScreen(){
 const open=view.status==='lobby';
 app.innerHTML=wrap(`<div class="introbox stack"><div class="hero"><div class="eyebrow" style="color:#e9becd">Sala ${esc(room)}</div><h1 style="font-size:2.65rem">${esc(view.name)}</h1><p>${view.playerCount} jugador(es) registrados. Cartones distintos y premios por letra y cartón completo.</p></div>
 <section class="card stack"><h2>${open?'¡Tu cartón te espera!':'Inscripciones cerradas'}</h2>${open?`<p class="muted">Escribe tu nombre y recibirás un cartón de 25 versículos. No necesitas instalar nada.</p><form data-form="join" class="stack"><div class="field"><label for="playerName">Tu nombre</label><input class="input" id="playerName" name="name" placeholder="Nombre y apellido" autocomplete="name" required minlength="2" maxlength="48" /></div><button class="btn wide">Recibir mi cartón →</button></form>`:`<p>La partida ya empezó. Solo puedes observar desde la pantalla pública o recuperar tu cartón en el mismo navegador donde te inscribiste.</p><a class="btn outline wide" href="${esc(link('pantalla'))}">Ver proyección pública</a>`}</section></div>`);
}
function homeScreen(){app.innerHTML=wrap(`<div class="introbox stack"><div class="hero"><div class="eyebrow" style="color:#e9becd">Una experiencia de fe y diversión</div><h1>BINGO<br>BÍBLICO</h1><p>Un cartón. 25 referencias. Una ruleta de 75 versículos. Seis premios. ¡Todo desde tu celular!</p></div><section class="card stack"><h2>Entrar a una partida</h2><p class="muted">Pide al organizador el código de seis caracteres.</p><form data-form="enter" class="stack"><div class="field"><label for="roomcode">Código de sala</label><input class="input" id="roomcode" name="room" placeholder="Ej.: AB3CD4" maxlength="8" required style="text-align:center;letter-spacing:.18em;text-transform:uppercase;font-weight:900" /></div><button class="btn wide">Entrar al bingo →</button></form><div class="divider"></div><a class="btn outline wide" href="/?admin=1">Soy organizador</a></section><div class="feature">✦ &nbsp; Sin instalar aplicaciones</div><div class="feature">✦ &nbsp; Reclamos de 20 segundos y desempates justos</div><div class="feature">✦ &nbsp; El servidor comprueba todas las marcas</div></div>`);}
function adminLogin(){
 app.innerHTML=wrap(`<div class="introbox stack"><div class="hero"><div class="eyebrow" style="color:#e9becd">Zona privada</div><h1 style="font-size:2.75rem">Panel de control</h1><p>Administra salas, ruleta, participantes y ganadores.</p></div><section class="card stack"><h2>Acceso del organizador</h2><form data-form="login" class="stack"><div class="field"><label for="pw">Clave administrativa</label><input type="password" class="input" id="pw" name="password" required autocomplete="current-password" placeholder="Tu clave secreta" /></div><button class="btn wide">Acceder →</button></form><p class="small muted">La clave se configura en el servidor. No se comparte con los participantes.</p></section></div>`);
}
async function loadAdminRooms(){
 try{const result=await api('/api/admin/rooms');rooms=result.rooms;adminLobby();}
 catch(err){auth='';localStorage.removeItem('bingo_admin');adminLogin();}
}
function adminLobby(){
 app.innerHTML=wrap(`<div class="page-title"><div><div class="eyebrow">Organizador</div><h1>Mis partidas</h1><p class="subtitle">Crea y administra una o varias salas de Bingo Bíblico.</p></div></div><div class="grid2"><section class="card stack"><h2>Crear una partida</h2><p class="muted small">Se utilizará el banco de 75 referencias preparado para esta aplicación.</p><form data-form="create" class="stack"><div class="field"><label for="eventName">Nombre del evento</label><input id="eventName" name="name" class="input" value="Bingo Bíblico Virtual" maxlength="80" required /></div><button class="btn wide">＋ Crear sala</button></form><div class="notice">Antes de comenzar deben entrar los jugadores. Al iniciar, el sistema crea un orden de sorteo aleatorio y único.</div></section><section class="card stack"><div class="row between"><h2 style="margin:0">Salas anteriores</h2><button class="btn small outline" data-action="refresh-rooms">Actualizar</button></div><div class="roomlist">${rooms.length?rooms.map(r=>`<div class="roomitem"><div><b>${esc(r.name)}</b><div class="muted tiny">${r.code} · ${r.players} jugadores · ${r.status}</div></div><a href="/?admin=1&room=${r.code}" class="btn small secondary">Abrir</a></div>`).join(''):'<div class="empty">Todavía no hay salas.<br>Crea la primera a la izquierda.</div>'}</div></section></div>`);
}
function adminRoom(){
 const current=view.current;
 const pending=!!current&&!current.revealed;
 const hasWindow=view.windows.length>0;
 const active=view.status==='running'&&!view.paused;
 const canDraw=active&&!pending&&!hasWindow&&view.drawCount<75;
 const linkP=link('s'),linkPub=link('pantalla');
 const qr='https://api.qrserver.com/v1/create-qr-code/?size=180x180&data='+encodeURIComponent(linkP);
 app.innerHTML=wrap(`<div class="page-title"><div><div class="eyebrow">Panel del organizador · Sala ${esc(room)}</div><h1>${esc(view.name)}</h1><div class="subtitle">${view.playerCount} participantes · ${view.drawCount}/75 referencias sorteadas</div></div>${statusPill()}</div>
 <div class="grid3" style="margin-bottom:18px"><div class="stat"><b>${view.playerCount}</b><span>Participantes</span></div><div class="stat"><b>${view.drawCount}</b><span>Versículos sorteados</span></div><div class="stat"><b>${Object.values(view.results).filter(Boolean).length}/6</b><span>Premios entregados</span></div></div>
 <div class="adminpane"><div class="stack"><section class="card stack"><div class="row between"><h2 style="margin:0">🎡 Ruleta</h2><span class="pill">🔐 Azar seguro</span></div><div class="wheel" aria-hidden="true"></div>${lastVerseHtml()}${view.status==='lobby'?`<button class="btn wide green" data-action="start" ${view.playerCount<1?'disabled':''}>▶ Iniciar partida</button>`:''}
 ${view.status==='running'?`<button class="btn wide" data-action="draw" ${!canDraw?'disabled':''}>🎡 Girar y sortear versículo</button><button class="btn wide gold" data-action="reveal" ${!pending?'disabled':''}>◉ Revelar referencia</button><div class="row"><button class="btn secondary" style="flex:1" data-action="${view.paused?'resume':'pause'}" ${hasWindow||pending?'disabled':''}>${view.paused?'▶ Reanudar':'Ⅱ Pausar'}</button><button class="btn outline" style="flex:1" data-action="finish" ${hasWindow||pending?'disabled':''}>Finalizar</button></div>`:''}
 ${view.status==='finished'?'<div class="success">✓ Esta partida ha terminado. Puedes crear otra desde Mis partidas.</div>':''}${hasWindow?'<div class="notice">⏱ Hay reclamos abiertos. El siguiente giro quedará bloqueado hasta adjudicarlos.</div>':''}</section>
 ${claimHtml()}<section class="card stack"><h3>🏆 Premios y ganadores</h3>${awardsHtml()}</section></div>
 <div class="stack"><section class="card stack"><h3>Compartir la sala</h3><div class="center"><img class="qr" src="${qr}" alt="Código QR para que ingresen los participantes" loading="lazy" /></div><div class="linkline">${esc(linkP)}</div><button class="btn secondary wide" data-action="share-player">↗ Compartir enlace con jugadores</button><button class="btn outline wide" data-action="share-projector">▣ Copiar enlace de proyección</button><p class="muted tiny" style="margin:0">Escanea el QR desde otro celular o comparte el enlace por WhatsApp.</p></section>
 <section class="card stack"><div class="row between"><h3 style="margin:0">Participantes</h3><span class="pill">${view.playerCount}</span></div><div class="scroll">${view.players?.length?view.players.map(p=>`<div class="roomitem"><span class="small"><b>${esc(p.name)}</b><br><span class="muted tiny">${p.marked}/25 marcadas</span></span>${p.wins.length?`<span class="pill good">🏆 ${p.wins.join(', ')}</span>`:'<span class="pill">Participando</span>'}</div>`).join(''):'<p class="muted small">Esperando participantes…</p>'}</div></section>
 <section class="card stack"><h3>Historial de sorteos</h3>${historyHtml()}<a class="btn outline" href="/api/admin/export/${room}" data-action="download">↓ Exportar auditoría (CSV)</a></section></div></div>
 ${view.status==='finished'?proofHtml():''}`);tick();
}
function projectorScreen(){
 const current=view.current,hasWinner=Object.entries(view.results).filter(([,a])=>a);
 app.innerHTML=`<main class="appwrap projector"><div class="topbar"><a class="brand" href="/"><span class="brand-icon">✦</span><span>BINGO BÍBLICO VIRTUAL</span></a><span class="pill dark">Sala ${esc(room)}</span></div><div class="hero"><div class="wheel" aria-hidden="true"></div><div class="eyebrow" style="color:#efbdcf;margin-top:22px">${view.name?esc(view.name):'Bingo Bíblico'}</div><h1>${current?.revealed?esc(verses[current.id]?.ref||current.id):current?'¡Prepárense!':'BINGO BÍBLICO'}</h1>${current?.revealed?`<p class="verse-text">${esc(textCache[current.id]||'Busquen esta referencia en sus cartones.')}</p>`:`<p>${current?'Referencia oculta · esperando al presentador':'Esperando el primer sorteo…'}</p>`}
 ${view.windows.length?`<div class="pill" style="margin:25px 0 10px">🏆 Premio(s): ${view.windows.map(w=>w.cat==='FULL'?'Cartón completo':w.cat).join(' · ')}</div><div class="timer" data-deadline="${view.windows[0].deadline}">00:20</div><p>¡Busquen, marquen y reclamen!</p>`:''}</div>
 <section class="card" style="margin-top:18px"><div class="row between wrap"><div><b>${view.playerCount} jugadores</b><div class="small muted">${view.drawCount}/75 sorteos</div></div>${statusPill()}</div>${hasWinner.length?`<div class="divider"></div><h3>🏆 Premios adjudicados</h3><div class="history">${hasWinner.map(([cat,a])=>`<span>${cat==='FULL'?'Cartón completo':cat}: ${esc(a.name)}</span>`).join('')}</div>`:''}</section></main>`;tick();
}
async function loadText(id){
 if(!id||textCache[id]||pendingVerse.has(id))return;
 const v=verses[id];if(!v)return;
 pendingVerse.add(id);
 try{
   const response=await fetch(`https://api.midvash.com/v1/rvr1909/${encodeURIComponent(v.slug)}/${v.chapter}/${v.verse}`,{signal:AbortSignal.timeout(6500)});
   if(!response.ok)throw new Error('No disponible');
   const obj=await response.json();
   const t=obj?.data?.text;
   if(typeof t==='string'&&t.length)textCache[id]=t;
 }catch{}
 finally{pendingVerse.delete(id);if(view?.current?.id===id)render();}
}
function render(){
 if(isAdminMode){if(!auth)return adminLogin();if(!room)return adminLobby();if(view)return adminRoom();return;}
 if(!room)return homeScreen();
 if(!view)return;
 if(isProjector)return projectorScreen();
 if(view.me)return playerScreen();
 return joinScreen();
}
async function act(action,target){
 try{
  if(action==='logout'){localStorage.removeItem('bingo_admin');auth='';room='';history.replaceState({},'', '/?admin=1');return adminLogin();}
  if(action==='refresh-rooms')return loadAdminRooms();
  if(action==='download'){
    const response=await fetch('/api/admin/export/'+room,{headers:{Authorization:'Bearer '+auth}});
    if(!response.ok)throw new Error('No fue posible exportar el informe.');
    const blob=await response.blob();const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='bingo-'+room+'.csv';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),3000);return;
  }
  if(action==='share-player'||action==='share-projector'){
    const linkValue=action==='share-player'?link('s'):link('pantalla');
    if(action==='share-player'&&navigator.share){try{await navigator.share({title:'Bingo Bíblico',text:'¡Participa en el Bingo Bíblico! Sala '+room,url:linkValue});return;}catch(e){if(e.name==='AbortError')return;}}
    await navigator.clipboard.writeText(linkValue);return toast('Enlace copiado. Ya puedes enviarlo por WhatsApp.');
  }
  if(action==='mark'){
    target.disabled=true;
    await api('/api/room/'+room+'/mark',{id:target.dataset.id,marked:target.dataset.current!=='true'});
    return updateState();
  }
  if(action==='claim'){
    target.disabled=true;await api('/api/room/'+room+'/claim',{category:target.dataset.cat});toast('✓ Reclamo recibido y validado. ¡Éxito!');return updateState();
  }
  if(['start','draw','reveal','pause','resume','finish'].includes(action)){
    if(action==='finish'&&!confirm('¿Finalizar esta partida? Los premios sin entregar quedarán disponibles solo en el registro.'))return;
    target.disabled=true;
    const response=await api('/api/room/'+room+'/'+action,{});
    if(action==='reveal'&&response.opened?.length)toast('¡Premios habilitados! Se abren 20 segundos de reclamo.');
    if(action==='draw')toast('🎡 Se sorteó una referencia. Presiona Revelar.');
    return updateState();
  }
 }catch(err){toast(err.message);target.disabled=false;}
}
app.addEventListener('click',e=>{
 const target=e.target.closest('[data-action]');if(!target)return;
 e.preventDefault();act(target.dataset.action,target);
});
app.addEventListener('submit',async e=>{
 const form=e.target.closest('[data-form]');if(!form)return;
 e.preventDefault();const type=form.dataset.form;
 const fd=new FormData(form),button=form.querySelector('button');button.disabled=true;
 try{
  if(type==='enter')return location.assign('/?s='+encodeURIComponent(String(fd.get('room')).trim().toUpperCase()));
  if(type==='join'){
    const joined=await api('/api/join',{room,name:String(fd.get('name')||'')});
    localStorage.setItem('bingo_p_'+room,joined.token);toast('¡Recibiste tu cartón!');return updateState();
  }
  if(type==='login'){
    const response=await api('/api/admin/login',{password:String(fd.get('password')||'')});auth=response.token;
    localStorage.setItem('bingo_admin',auth);
    if(room)return updateState();return loadAdminRooms();
  }
  if(type==='create'){
    const result=await api('/api/admin/rooms',{name:String(fd.get('name')||'Bingo Bíblico')});
    room=result.code;location.assign('/?admin=1&room='+room);return;
  }
 }catch(err){toast(err.message);button.disabled=false;}
});
async function boot(){
 try{const r=await fetch('/api/verses');const data=await r.json();verses=Object.fromEntries(data.verses.map(v=>[v.id,v]));}
 catch{toast('No se pudo cargar el banco de versículos.');}
 if(isAdminMode&&!room){if(auth)await loadAdminRooms();else adminLogin();return;}
 if(room){watchRoom();await updateState();}else render();
}
boot();
})();
