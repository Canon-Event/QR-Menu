const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')

/** Real settings/auth/validation modules; only Supabase storage and identity are fixtures. */
function settingsFixture(initial={}) {
  const state={restaurant:{id:'fixture',owner_id:'fixture-owner',template:'A',template_settings:{},...initial},writes:[]}
  const db={auth:{getUser:async()=>({data:{user:{id:'fixture-owner'}}})},from(table){
    let updates=null;const filters=[]
    const query={select(){return query},limit(){return query},eq(key,value){filters.push([key,value]);return query},update(value){updates=value;return query},async maybeSingle(){
      if(table!=='restaurants'||filters.some(([key,value])=>state.restaurant[key]!==value))return {data:null,error:null}
      if(updates){state.writes.push(structuredClone(updates));Object.assign(state.restaurant,updates)}
      return {data:structuredClone(state.restaurant),error:null}
    }}
    return query
  }}
  const cache=new Map()
  function load(file){
    let filename=path.resolve(file)
    if(!path.extname(filename))filename=['.ts','.tsx'].map(ext=>filename+ext).find(f=>fs.existsSync(f))
    if(cache.has(filename))return cache.get(filename).exports
    const module={exports:{}};cache.set(filename,module)
    const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
    const resolve=name=>name==='@/lib/supabase-server'?{createSupabaseServerClient:async()=>db}:name.startsWith('@/')?load(name.slice(2)):name.startsWith('.')?load(path.resolve(path.dirname(filename),name)):require(name)
    Function('exports','require','module',code)(module.exports,resolve,module)
    return module.exports
  }
  return {state,PATCH:load('app/api/settings/route.ts').PATCH}
}
module.exports={settingsFixture}
