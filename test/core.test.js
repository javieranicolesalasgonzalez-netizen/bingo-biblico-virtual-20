const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const core=require('../src/core');
function newRoom(n=2){
 const room=core.makeRoom('Ensayo','TEST01');
 for(let i=0;i<n;i++)room.players.push({id:'p'+i,name:'Jugador '+i,card:core.generateCard(room),marks:[],wins:[]});
 return room;
}
test('Banco: 75 versos distintos, 15 por letra',()=>{
 assert.equal(core.VERSES.length,75);
 assert.equal(new Set(core.VERSES.map(x=>x.ref)).size,75);
 for(const col of core.LETTERS)assert.equal(core.VERSES.filter(x=>x.col===col).length,15);
});
test('Cartones: 25 referencias, cinco por letra y sin duplicados',()=>{
 const r=newRoom(100);
 assert.equal(new Set(r.players.map(p=>core.LETTERS.map(x=>p.card[x].join(',')).join('|'))).size,100);
 for(const p of r.players){
  assert.equal(core.LETTERS.flatMap(x=>p.card[x]).length,25);
  for(const col of core.LETTERS){assert.equal(p.card[col].length,5);assert.ok(p.card[col].every(id=>id.startsWith(col)));}
 }
});
test('La secuencia es una permutación de 75 y puede verificarse',()=>{
 const r=newRoom();core.start(r);
 assert.equal(new Set(r.sequence).size,75);
 assert.equal(createHash('sha256').update(r.sequenceSalt+':'+JSON.stringify(r.sequence)).digest('hex'),r.commitment);
 for(let i=0;i<75;i++){const id=core.draw(r);assert.ok(id);core.reveal(r,1000+i*25000);core.settle(r,1000+i*25000+20001);}
 core.finish(r);assert.equal(r.status,'finished');assert.equal(r.draws.length,75);
});
test('No permite marcar una referencia oculta ni una no sorteada',()=>{
 const r=newRoom(1),p=r.players[0];core.start(r);core.draw(r);
 assert.throws(()=>core.mark(r,p,p.card.B[0],true),/aún no/);
 core.reveal(r);const verse=r.draws[0].id;
 if(core.LETTERS.flatMap(x=>p.card[x]).includes(verse)){
  core.mark(r,p,verse,true);assert.ok(p.marks.includes(verse));
 }else assert.throws(()=>core.mark(r,p,verse,true),/no está/);
});
test('Reclamo válido solo con 5 marcas y ventana de 20s',()=>{
 const r=newRoom(2);r.status='running';
 // Se crea una situación donde ambos cartones completaron B al revelarse el último versículo.
 const chosen=new Set(r.players.flatMap(p=>p.card.B));
 r.draws=[...chosen].map(id=>({id,revealed:true,at:1,revealedAt:1}));
 const now=100000;
 r.windows=[{id:'w1',cat:'B',status:'open',openedAt:now,deadline:now+20000,drawIndex:r.draws.length,claims:[],winnerId:null}];
 const p=r.players[0];
 assert.throws(()=>core.claim(r,p,'B',now+500),/Debes marcar/);
 p.marks=[...p.card.B];
 assert.deepEqual(core.claim(r,p,'B',now+500),{accepted:true});
 assert.deepEqual(core.claim(r,p,'B',now+800),{already:true});
 assert.throws(()=>core.claim(r,r.players[1],'B',now+20000),/No existe/);
});
test('Un desempate elige uniformemente entre reclamantes sin usar orden de llegada',()=>{
 const r=newRoom(3);r.status='running';r.draws=r.players.flatMap(p=>p.card.B).filter((v,i,a)=>a.indexOf(v)===i).map(id=>({id,revealed:true,revealedAt:1,at:1}));
 const w={id:'w2',cat:'B',status:'open',openedAt:1000,deadline:21000,claims:r.players.map((p,i)=>({playerId:p.id,at:1000+i*3000})),winnerId:null};
 r.windows=[w];for(const p of r.players)p.marks=[...p.card.B];
 core.settle(r,21000,()=>2);
 assert.equal(r.results.B.playerId,r.players[2].id);
 assert.equal(r.results.B.eligibleCount,3);
 assert.equal(w.status,'closed');
 assert.equal(r.players[2].wins[0],'B');
});
test('Quien ganó letra no puede ganar otra letra, pero sí cartón completo',()=>{
 const r=newRoom(1);const p=r.players[0];r.status='running';p.wins.push('B');
 r.draws=core.VERSES.map(v=>({id:v.id,at:1,revealed:true,revealedAt:1}));p.marks=core.LETTERS.flatMap(x=>p.card[x]);
 r.windows=[{id:'one',cat:'I',status:'open',openedAt:1,deadline:21000,claims:[],winnerId:null},{id:'two',cat:'FULL',status:'open',openedAt:1,deadline:21000,claims:[],winnerId:null}];
 assert.throws(()=>core.claim(r,p,'I',1000),/Ya recibiste/);
 assert.deepEqual(core.claim(r,p,'FULL',1000),{accepted:true});
 core.settle(r,21000);assert.equal(r.results.FULL.playerId,p.id);assert.equal(r.results.I,null);
});
test('Si nadie reclama una ventana, el premio sigue disponible',()=>{
 const r=newRoom(1);r.status='running';r.windows=[{id:'empty',cat:'G',status:'open',deadline:100,claims:[],winnerId:null}];
 const updates=core.settle(r,200);assert.deepEqual(updates,['G']);assert.equal(r.results.G,null);
});
