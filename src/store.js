'use strict';
const fs=require('node:fs');
const path=require('node:path');
const seed=()=>({rooms:{},schema:1});
class FileStore {
  constructor(file=path.join(__dirname,'..','data','game.json')){
    this.file=file;fs.mkdirSync(path.dirname(file),{recursive:true});
    this.state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):seed();
  }
  async read(fn){return fn(structuredClone(this.state));}
  async transact(fn){
    // Sin await intermedio: operaciones de juego serializadas en un único proceso Node.
    const state=structuredClone(this.state);
    const result=fn(state);
    const tmp=this.file+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(state));fs.renameSync(tmp,this.file);this.state=state;
    return result;
  }
}
class PostgresStore {
  constructor(url){
    const {Pool}=require('pg');
    this.pool=new Pool({connectionString:url,max:10,ssl:process.env.PGSSL==='true'?{rejectUnauthorized:true}:undefined});
  }
  async init(){
    await this.pool.query('CREATE TABLE IF NOT EXISTS bingo_state (id SMALLINT PRIMARY KEY, data JSONB NOT NULL)');
    await this.pool.query('INSERT INTO bingo_state (id,data) VALUES (1,$1::jsonb) ON CONFLICT (id) DO NOTHING',[JSON.stringify(seed())]);
  }
  async read(fn){
    const rows=await this.pool.query('SELECT data FROM bingo_state WHERE id=1');
    return fn(rows.rows[0].data);
  }
  async transact(fn){
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const rows=await client.query('SELECT data FROM bingo_state WHERE id=1 FOR UPDATE');
      const state=rows.rows[0].data;
      const result=fn(state);
      await client.query('UPDATE bingo_state SET data=$1::jsonb WHERE id=1',[JSON.stringify(state)]);
      await client.query('COMMIT');
      return result;
    }catch(err){await client.query('ROLLBACK').catch(()=>{});throw err;}
    finally{client.release();}
  }
}
async function makeStore(){
  if(process.env.DATABASE_URL){const s=new PostgresStore(process.env.DATABASE_URL);await s.init();return s;}
  if(process.env.NODE_ENV==='production') throw new Error('Se requiere DATABASE_URL (PostgreSQL) en producción para conservar partidas y premios.');
  console.warn('ALMACENAMIENTO DE PRUEBA: archivo JSON local. NO PUBLICAR COMO PRODUCCIÓN.');
  return new FileStore();
}
module.exports={makeStore,FileStore,PostgresStore};
