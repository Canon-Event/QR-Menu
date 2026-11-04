const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto')
const {NextResponse}=require('next/server'),{loadServer}=require('./helpers/load-server.cjs'),{aiDatabase,draft,style,png}=require('./helpers/ai-menu-fixture.cjs')
async function fixture(){
  const h=await aiDatabase();let signedIn=true,providerCalls=0
  async function rpc(name,args,admin=false){
    await h.as(admin?null:h.owner,admin?'service_role':'authenticated')
    try{return {data:await h.call(name,Object.values(args)),error:null}}catch(error){return {data:null,error:{code:error.code}}}
  }
  const menuApi=loadServer('lib/menu-api.ts')
  function from(table){
    assert.equal(table,'ai_menu_jobs');let values,conditions=[]
    const query={update(v){values=v;return query},eq(k,v){conditions.push([k,v]);return query},is(k,v){assert.equal(k,'published');assert.equal(v,null);conditions.push([k,v]);return query},select(){return query},async maybeSingle(){
      await h.as(null,'service_role')
      assert.deepEqual(conditions.map(c=>c[0]),['id','restaurant_id','status','published'])
      try {const result=await h.db.query('update ai_menu_jobs set draft=$1::jsonb where id=$2 and restaurant_id=$3 and status=$4 and published is null returning id',[JSON.stringify(values.draft),...conditions.slice(0,3).map(c=>c[1])]);return {data:result.rows[0]||null,error:null}}catch(error){return {data:null,error:{code:error.code}}}
    }};return query
  }
  const route=loadServer('app/api/menu/ai/route.ts',{
    '@/lib/menu-api':{...menuApi,getOwnedRestaurant:async()=>signedIn?{restaurantId:h.restaurant,supabase:{rpc:(n,a)=>rpc(n,a)}}:{error:NextResponse.json({error:'Sign in'},{status:401})}},
    '@/lib/supabase':{supabaseAdmin:()=>({rpc:(n,a)=>rpc(n,a,true),from})},
  },{GEMINI_API_KEY:'fixture-key',SUPABASE_SERVICE_ROLE_KEY:'fixture-service'})
  const oldFetch=global.fetch
  global.fetch=async()=>{providerCalls++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(draft())}]}}]})}
  function upload(id=randomUUID(),bytes=png(),type='image/png',headers={},verify){const form=new FormData();form.set('requestId',id);if(verify!==undefined)form.set('verify',verify);form.append('photos',new File([bytes],'menu.png',{type}));return new Request('https://menu.test/api/menu/ai',{method:'POST',headers,body:form})}
  function patch(body,headers={}){return new Request('https://menu.test/api/menu/ai',{method:'PATCH',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)})}
  return {...h,route,upload,patch,calls:()=>providerCalls,signOut:()=>signedIn=false,close:async()=>{global.fetch=oldFetch;await h.db.close()}}
}
test('real HTTP route validates origin, uploads and authentication before spending AI quota',async t=>{
  const f=await fixture();t.after(()=>f.close())
  assert.equal((await f.route.POST(f.upload(undefined,undefined,undefined,{origin:'https://evil.test'}))).status,403)
  assert.equal((await f.route.POST(f.upload(undefined,Buffer.from('<svg/>'),'image/png'))).status,415)
  assert.equal((await f.route.POST(f.upload(undefined,png(),'image/jpeg'))).status,415)
  assert.equal((await f.route.POST(f.upload(undefined,Buffer.alloc(3*1024*1024+1),'image/png'))).status,413)
  f.signOut();assert.equal((await f.route.POST(f.upload())).status,401);assert.equal((await f.route.GET()).status,401);assert.equal(f.calls(),0)
})
test('verified scan uses two calls, stores disagreements for review, and caches mode-specific retries',async t=>{
  const f=await fixture();t.after(()=>f.close());let calls=0
  const first=draft(),second=draft();second.items[0].price=95;second.items.push({...second.items[0],name:'Iced Tea',price:22})
  global.fetch=async()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(++calls===1?first:second)}]}}]})
  const id=randomUUID(),response=await f.route.POST(f.upload(id,undefined,undefined,{},'true'));assert.equal(response.status,200)
  const checked=(await response.json()).draft;assert.equal(calls,2);assert.equal(checked.items.length,2);assert.equal(checked.items[0].price,null);assert.equal(checked.items[1].price,null)
  assert.match(checked.items[1].note,/only one reading/);assert.deepEqual((await (await f.route.GET()).json()).job.draft,checked)
  assert.equal((await (await f.route.POST(f.upload(id,undefined,undefined,{},'true'))).json()).cached,true);assert.equal(calls,2)
  assert.equal((await f.route.POST(f.upload(id,undefined,undefined,{},'false'))).status,409)
  assert.equal((await f.route.POST(f.upload(randomUUID(),undefined,undefined,{},'unsafe'))).status,400)
})
test('local OCR creates a private replay-safe draft from bounded text without making provider calls',async t=>{
  const f=await fixture();t.after(()=>f.close())
  const line=(text,x,y,width)=>({text,score:.99,poly:[[x,y],[x+width,y],[x+width,y+20],[x,y+20]]})
  const observations={version:'paddle-0.4.2-v6',imageHashes:['a'.repeat(64)],pages:[{width:600,height:800,items:[line('MAIN COURSE',30,80,120),line('Cheeseburger',30,120,150),line('$34',240,120,40)]}]}
  const body={action:'ocr',requestId:randomUUID(),observations}
  const request=(data=body,headers={})=>new Request('https://menu.test/api/menu/ai',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)})
  assert.equal((await f.route.POST(request(body,{origin:'https://evil.test'}))).status,403)
  const response=await f.route.POST(request());assert.equal(response.status,200);const draft=(await response.json()).draft
  assert.equal(draft.items[0].name,'Cheeseburger');assert.equal(draft.items[0].price,34);assert.equal(draft.items[0].isVeg,null);assert.equal(draft.currency,null);assert.equal(draft.items[0].source.page,1)
  assert.equal((await (await f.route.POST(request())).json()).cached,true);assert.equal(f.calls(),0)
  assert.equal((await f.route.POST(request({...body,observations:{...observations,imageHashes:['b'.repeat(64)]}}))).status,409)
  assert.equal((await f.route.POST(request({...body,requestId:randomUUID(),observations:{...observations,pages:[{...observations.pages[0],items:[line('Bad',900,0,100)]}]}}))).status,400)
  assert.equal((await f.route.POST(request({padding:'x'.repeat(256001)}))).status,400)
  assert.equal((await (await f.route.GET()).json()).ocrConfigured,true)
  assert.equal((await f.route.PATCH(f.patch({action:'publish',id:body.requestId,draft:{...draft,currency:'INR',items:draft.items.map(item=>({...item,isVeg:true}))},style,useBasic:true,reviewed:true}))).status,200)
  f.signOut();assert.equal((await f.route.POST(request())).status,401)
})
test('real extraction/DB/HTTP pipeline resumes drafts, caches request retries, requires review and publishes once',async t=>{
  const f=await fixture();t.after(()=>f.close());const id=randomUUID()
  const scanned=await f.route.POST(f.upload(id));assert.equal(scanned.status,200);assert.equal(scanned.headers.get('cache-control'),'private, no-store');const scan=await scanned.json();assert.equal(scan.draft.items[0].name,'Lassi')
  const cached=await f.route.POST(f.upload(id));assert.equal((await cached.json()).cached,true);assert.equal(f.calls(),1)
  const state=await f.route.GET(),body=await state.json();assert.equal(body.configured,true);assert.equal(body.job.id,id);assert.ok(!JSON.stringify(body).includes('fixture-key'))
  const publish={action:'publish',id,draft:scan.draft,style,useBasic:true,reviewed:false}
  assert.equal((await f.route.PATCH(f.patch(publish))).status,400)
  assert.equal((await f.route.PATCH(f.patch({...publish,reviewed:true,draft:{...scan.draft,items:[{...scan.draft.items[0],price:null}]}}))).status,400)
  const saved=await f.route.PATCH(f.patch({...publish,reviewed:true}));assert.equal(saved.status,200);assert.equal((await saved.json()).imported,1)
  assert.equal((await (await f.route.PATCH(f.patch({...publish,reviewed:true}))).json()).replayed,true)
  assert.equal((await f.route.PATCH(f.patch({action:'style',style,presentation:'template'}))).status,200);assert.equal(f.calls(),1)
  await f.db.exec('reset role');assert.equal((await f.db.query('select count(*) n from dishes')).rows[0].n,1)
})
test('quota and provider failures return actionable safe errors and retain failed-attempt budgets',async t=>{
  const f=await fixture();t.after(()=>f.close())
  global.fetch=async()=>new Response('upstream secret fixture-key',{status:429})
  const r=await f.route.POST(f.upload());assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'60');assert.ok(!(await r.text()).includes('fixture-key'))
  global.fetch=async()=>new Response('upstream secret fixture-key',{status:403})
  assert.equal((await f.route.POST(f.upload())).status,503)
  const limited=await f.route.POST(f.upload());assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'60')
  await f.db.exec('reset role');const counts=(await f.db.query("select count(*) n from ai_menu_jobs where status='failed'")).rows[0];assert.equal(counts.n,2)
})
test('JSON limits bind actual streamed bytes, including missing Content-Length, without changing normal endpoint defaults',async t=>{
  const f=await fixture();t.after(()=>f.close())
  assert.equal((await f.route.PATCH(f.patch({action:'style',style,presentation:'basic'},{origin:'https://evil.test'}))).status,403)
  assert.equal((await f.route.PATCH(f.patch({padding:'x'.repeat(100001)}))).status,400)
  assert.equal((await f.route.PATCH(f.patch({action:'style',style:{...style,text:'#fffaf3'},presentation:'basic'}))).status,400)
  assert.equal((await f.route.PATCH(f.patch({action:'style',style,presentation:'basic'}))).status,200)
  const design={...style,layout:'cards',backdrop:'glow',motion:'gentle',heroImage:'https://images.example.test/menu.webp',tagline:'Fresh from our kitchen',showImages:false}
  assert.equal((await f.route.PATCH(f.patch({action:'style',style:design,presentation:'basic'}))).status,200)
  assert.deepEqual((await (await f.route.GET()).json()).style,design)
  assert.equal((await f.route.PATCH(f.patch({action:'style',style:{...design,heroImage:'javascript:alert(1)'},presentation:'basic'}))).status,400)
})

test('draft saving persists incomplete edits privately, without scanning, and rejects other restaurants or completed jobs',async t=>{
  const f=await fixture();t.after(()=>f.close());const id=await f.ready()
  const review=loadServer('lib/menu-review.ts'),portions=loadServer('lib/menu-portions.ts')
  const key=review.menuReviewKey(portions.groupMenuPortions(draft().items,i=>i.category)[0])
  const body={action:'draft',id,draft:draft(),style,useBasic:true,reviewedKeys:[key,'forged']}
  const saved=await f.route.PATCH(f.patch(body));assert.equal(saved.status,200);assert.equal(typeof (await saved.json()).savedAt,'string');assert.equal(f.calls(),0)
  const stored=(await (await f.route.GET()).json()).job.draft
  assert.deepEqual(stored._reviewedKeys,[key]);assert.deepEqual(stored._style,style);assert.equal(stored._useBasic,true)
  assert.equal((await f.route.PATCH(f.patch({...body,draft:{...draft(),items:[{...draft().items[0],name:'',price:null,isVeg:null}]}}))).status,200)
  assert.deepEqual((await (await f.route.GET()).json()).job.draft._reviewedKeys,[])
  await f.as(null,'service_role');await f.db.query('update ai_menu_jobs set restaurant_id=$1 where id=$2',[f.otherRestaurant,id])
  assert.equal((await f.route.PATCH(f.patch(body))).status,409)
  await f.as(null,'service_role');await f.db.query("update ai_menu_jobs set restaurant_id=$1,published='{}' where id=$2",[f.restaurant,id])
  assert.equal((await f.route.PATCH(f.patch(body))).status,409)
  await f.as(null,'service_role');await f.db.query("update ai_menu_jobs set published=null,status='failed' where id=$1",[id])
  assert.equal((await f.route.PATCH(f.patch(body))).status,409)
  assert.equal((await f.route.PATCH(f.patch({...body,reviewedKeys:'bad'}))).status,400)
  assert.equal((await f.route.PATCH(f.patch({...body,id:'invalid'}))).status,400)
  f.signOut();assert.equal((await f.route.PATCH(f.patch(body))).status,401)
})
