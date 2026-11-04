const fs = require('node:fs'), { randomUUID } = require('node:crypto'), zlib = require('node:zlib')
const style = { font:'manrope', accent:'#92400e', background:'#fffaf3', text:'#242424', density:'comfortable' }
const draft = () => ({ currency:'INR', warnings:[], items:[{category:'Drinks',name:'Lassi',description:'Fresh yoghurt',price:90,isVeg:true,note:''}] })
function png(width=128,height=128) {
  function chunk(type,data) {
    const bytes=Buffer.concat([Buffer.from(type),data]); let crc=0xffffffff
    for (const byte of bytes) { crc^=byte; for(let b=0;b<8;b++) crc=(crc>>>1)^((crc&1)?0xedb88320:0) }
    const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0)
    return Buffer.concat([head,bytes,tail])
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2
  const rows=Buffer.alloc((width*3+1)*height,255);for(let y=0;y<height;y++)rows[y*(width*3+1)]=0
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))])
}
async function aiDatabase() {
  const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite')
  const db=new PGlite(),owner=randomUUID(),otherOwner=randomUUID(),restaurant=randomUUID(),otherRestaurant=randomUUID()
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;`)
  await db.exec(fs.readFileSync('supabase/schema.sql','utf8'));await db.exec(fs.readFileSync('supabase/phase-ai-menu.sql','utf8'))
  await db.query('insert into auth.users values($1),($2)',[owner,otherOwner])
  await db.query("insert into restaurants(id,owner_id,name,slug) values($1,$2,'Test Cafe','test-cafe'),($3,$4,'Other','other-cafe')",[restaurant,owner,otherRestaurant,otherOwner])
  async function as(id,role=id?'authenticated':'anon') { await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec(`set role ${role}`) }
  async function call(name,args) { return (await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args.map(a=>a&&typeof a==='object'?JSON.stringify(a):a))).rows[0].result }
  async function ready(data=draft(),r=restaurant) {
    await as(owner); const id=randomUUID(); await call('ai_menu_begin',[r,id,'a'.repeat(64)])
    await as(null,'service_role');await call('ai_menu_complete',[id,data]);await as(owner);return id
  }
  await as(owner)
  return {db,as,call,ready,owner,otherOwner,restaurant,otherRestaurant}
}
module.exports={aiDatabase,draft,style,png}
