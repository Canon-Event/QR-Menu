const {test}=require('node:test'),assert=require('node:assert/strict'),{NextResponse}=require('next/server')
const {loadServer}=require('./helpers/load-server.cjs'),{png}=require('./helpers/ai-menu-fixture.cjs')
function fixture(){
  const state={signedIn:true,logo:'https://images.test/old.png',uploads:[],removals:[],writes:[],failSave:false}
  const supabase={storage:{from:()=>({upload:async(path,bytes)=>{state.uploads.push({path,bytes:bytes.length});return {error:null}},getPublicUrl:path=>({data:{publicUrl:'https://images.test/'+path}}),remove:async paths=>{state.removals.push(...paths);return {error:null}}})},from:table=>({update:value=>({eq:async(column,id)=>{state.writes.push({table,value,column,id});if(state.failSave)return {error:{code:'failure'}};state.logo=value.logo_url;return {error:null}}})})}
  const route=loadServer('app/api/settings/logo/route.ts',{'@/lib/menu-api':{...loadServer('lib/menu-api.ts'),getOwnedRestaurant:async()=>state.signedIn?{restaurantId:'owned-restaurant',supabase}:{error:NextResponse.json({error:'Sign in'},{status:401})}}})
  const upload=(headers={},type='image/png')=>{const form=new FormData();form.set('logo',new File([png()],'logo.png',{type}));form.set('restaurantId','another-restaurant');return new Request('https://menu.test/api/settings/logo',{method:'POST',headers,body:form})}
  const remove=(headers={})=>new Request('https://menu.test/api/settings/logo',{method:'DELETE',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({restaurantId:'another-restaurant'})})
  return {state,route,upload,remove}
}
test('logo upload and removal update only the authenticated owner’s restaurant',async()=>{
  const f=fixture(),saved=await f.route.POST(f.upload());assert.equal(saved.status,200)
  assert.match((await saved.json()).logoUrl,/owned-restaurant\/logo-/);assert.match(f.state.uploads[0].path,/^owned-restaurant\//)
  assert.deepEqual(f.state.writes[0],{table:'restaurants',value:{logo_url:f.state.logo},column:'id',id:'owned-restaurant'})
  const removed=await f.route.DELETE(f.remove());assert.equal(removed.status,200);assert.equal((await removed.json()).logoUrl,null);assert.equal(f.state.logo,null)
  assert.equal(f.state.writes[1].id,'owned-restaurant');assert.equal(f.state.removals.length,0,'Clearing a logo must preserve stored images that may still be referenced')
})
test('logo mutations require owner authentication, safe origins and supported file types',async()=>{
  const f=fixture();assert.equal((await f.route.POST(f.upload({origin:'https://evil.test'}))).status,403);assert.equal((await f.route.DELETE(f.remove({origin:'https://evil.test'}))).status,403)
  assert.equal((await f.route.POST(f.upload({},'image/svg+xml'))).status,400)
  f.state.signedIn=false;assert.equal((await f.route.POST(f.upload())).status,401);assert.equal((await f.route.DELETE(f.remove())).status,401)
  assert.equal(f.state.uploads.length,0);assert.equal(f.state.writes.length,0)
})
test('save failures retain the previous logo and roll back newly uploaded files',async()=>{
  const f=fixture();f.state.failSave=true
  assert.equal((await f.route.POST(f.upload())).status,500);assert.equal(f.state.logo,'https://images.test/old.png');assert.deepEqual(f.state.removals,[f.state.uploads[0].path])
  assert.equal((await f.route.DELETE(f.remove())).status,503);assert.equal(f.state.logo,'https://images.test/old.png')
})
