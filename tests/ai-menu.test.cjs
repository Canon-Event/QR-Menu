const {test}=require('node:test'),assert=require('node:assert/strict')
const {loadServer}=require('./helpers/load-server.cjs'),{draft,style,png}=require('./helpers/ai-menu-fixture.cjs')
const shared=loadServer('lib/ai-menu.ts')
const provider=env=>loadServer('lib/ai-menu-server.ts',{}, {GEMINI_API_KEY:'fixture-key',...env})
test('draft validation keeps unknown prices and dietary labels unresolved; publishing requires owner corrections',()=>{
  const value=draft();value.items[0].price=null;value.items[0].isVeg=null;value.currency=null
  assert.equal(shared.parseAiMenuDraft(value).items[0].price,null)
  assert.throws(()=>shared.parseAiMenuDraft(value,true),/confirm/)
  value.items[0].price=0;value.items[0].isVeg=false;value.currency='INR'
  assert.equal(shared.parseAiMenuDraft(value,true).items[0].price,0)
})
test('rejects malformed, oversized, duplicate and non-finite prices instead of coercing AI values',()=>{
  for(const price of ['90',undefined,NaN,Infinity,-1,1000001,4.444]) { const d=draft();d.items[0].price=price;assert.throws(()=>shared.parseAiMenuDraft(d)) }
  for(const value of [null,[],{}, {...draft(),items:[]},{...draft(),items:Array(101).fill(draft().items[0])},{...draft(),currency:'XXX'}])assert.throws(()=>shared.parseAiMenuDraft(value))
  const d=draft();d.items.push({...d.items[0],name:' lassi '});assert.throws(()=>shared.parseAiMenuDraft(d,true),/Duplicate/)
  d.items=[{...d.items[0],name:'x'.repeat(121)}];assert.throws(()=>shared.parseAiMenuDraft(d))
})
test('style uses safe tokens, supported fonts and readable contrast; invalid saved data falls back safely',()=>{
  assert.deepEqual(shared.parseBasicStyle(style),style)
  for(const bad of [{...style,font:'url(evil)'},{...style,accent:'red'},{...style,density:'huge'},{...style,text:style.background},{...style,accent:style.background}])assert.throws(()=>shared.parseBasicStyle(bad))
  assert.deepEqual(shared.safeBasicStyle({font:'evil'}),shared.DEFAULT_BASIC_STYLE)
})

test('studio presets and optional controls remain compatible with legacy styles and reject executable image/effect data',()=>{
  for(const preset of shared.BASIC_MENU_PRESETS) assert.deepEqual(shared.parseBasicStyle(preset.style),preset.style)
  const enhanced={...style,layout:'cards',backdrop:'dots',motion:'gentle',heroImage:'https://images.example.test/cover.webp',tagline:'A place at our table',showImages:false}
  assert.deepEqual(shared.parseBasicStyle(enhanced),enhanced)
  for(const image of shared.BASIC_COVER_IMAGES) assert.equal(shared.parseBasicStyle({...style,heroImage:image.src}).heroImage,image.src)
  for(const patch of [{layout:'html'},{backdrop:'url(evil)'},{motion:'fast'},{showImages:'true'},{tagline:'x'.repeat(101)},{heroImage:'javascript:alert(1)'},{heroImage:'data:image/svg+xml,bad'},{heroImage:'https://user:password@example.test/photo.jpg'},{heroImage:'/untrusted.svg'},{heroImage:null}]) assert.throws(()=>shared.parseBasicStyle({...style,...patch}))
})
test('image inspection checks actual PNG/JPEG headers, dimensions, declared types and maximum bytes',()=>{
  const p=provider();assert.deepEqual(p.inspectMenuImage(png(),'image/png'),{mime:'image/png',width:128,height:128})
  for(const [bytes,type] of [[png(),'image/jpeg'],[Buffer.from('<svg onload="bad()">'),'image/png'],[png(32,128),'image/png'],[Buffer.alloc(3*1024*1024+1),'image/png']])assert.throws(()=>p.inspectMenuImage(bytes,type))
  const huge=png();huge.writeUInt32BE(9000,16);assert.throws(()=>p.inspectMenuImage(huge,'image/png'))
  assert.equal(p.menuImageFingerprint([{bytes:png(),mime:'image/png'}]).length,64)
})
test('provider request is authenticated server-side and schema constrained; thought text is excluded',async t=>{
  const old=global.fetch;t.after(()=>global.fetch=old)
  global.fetch=async(url,options)=>{
    assert.equal(new URL(url).host,'generativelanguage.googleapis.com');assert.equal(new URL(url).search,'')
    assert.equal(options.headers['x-goog-api-key'],'fixture-key');assert.equal(options.redirect,'error')
    const request=JSON.parse(options.body);assert.equal(request.generationConfig.responseMimeType,'application/json');assert.equal(request.generationConfig.responseSchema.type,'OBJECT')
    assert.equal(request.generationConfig.responseSchema.properties.items.items.properties.price.nullable,true)
    assert.equal(request.generationConfig.responseSchema.properties.items.items.properties.isVeg.nullable,true)
    assert.equal(request.contents[0].parts[0].inlineData.mimeType,'image/png');assert.match(request.contents[0].parts.at(-1).text,/every menu row/i);assert.equal(request.tools,undefined)
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'ignore'},{text:JSON.stringify(draft())}]}}]})
  }
  assert.deepEqual(await provider().extractMenu([{bytes:png(),mime:'image/png'}]),draft())
})
test('two readings flag missing sections, invented rows, conflicting prices and ambiguous currency instead of guessing',()=>{
  const item=(category,name,price)=>({category,name,price,isVeg:null,description:'',note:''})
  const first={currency:'USD',warnings:[],items:[item('APPETIZERS','Fruit Salad',12),item('APPETIZERS','Cocktails',12),item('APPETIZERS','Nuggets',14),item('APPETIZERS','Sandwich',13),item('APPETIZERS','French Fries',9),item('BEVERAGE','Hot Drink',8)]}
  const second={currency:null,warnings:[],items:[item('APPETIZERS','Fruit Salad',13),item('APPETIZERS','Cocktails',12),item('APPETIZERS','Nuggets',14),item('APPETIZERS','Sandwich',13),item('APPETIZERS','French Fries',15),...['Milk Shake','Iced Tea','Orange Juice','Lemon Tea','Iced Coffee'].map((name,index)=>item('BEVERAGE',name,[34,22,24,33,23][index]))]}
  const checked=shared.compareAiMenuDrafts(first,second)
  assert.equal(checked.currency,null);assert.equal(checked.items.length,11)
  assert.equal(checked.items.find(i=>i.name==='Fruit Salad').price,null);assert.match(checked.items.find(i=>i.name==='Fruit Salad').note,/12 vs 13/)
  assert.equal(checked.items.find(i=>i.name==='French Fries').price,null);assert.equal(checked.items.find(i=>i.name==='Cocktails').price,12)
  for(const name of ['Hot Drink','Milk Shake','Iced Tea','Orange Juice','Lemon Tea','Iced Coffee']){
    const row=checked.items.find(i=>i.name===name);assert.equal(row.price,null);assert.match(row.note,/only one reading/)
  }
  assert.ok(checked.warnings.some(w=>w.includes('same mistake')));assert.throws(()=>shared.parseAiMenuDraft(checked,true),/confirm/)
})
test('unfinished owner edits recover locally but remain invalid to publish',()=>{
  const unfinished={...draft(),items:[...draft().items,{category:'Drinks',name:'',price:null,isVeg:null,description:'',note:''}]}
  assert.deepEqual(shared.parseEditableAiMenuDraft(unfinished),unfinished)
  assert.throws(()=>shared.parseAiMenuDraft(unfinished,true))
  assert.deepEqual(shared.parseEditableAiMenuDraft({...unfinished,items:[]}).items,[])
  assert.throws(()=>shared.parseAiMenuDraft({...unfinished,items:[]},true))
})
test('verification performs two independent provider requests and fails closed if either read fails',async t=>{
  const old=global.fetch;t.after(()=>global.fetch=old);let calls=0
  const first=draft(),second=draft();second.items[0].price=95
  global.fetch=async()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(++calls===1?first:second)}]}}]})
  const result=await provider().extractMenu([{bytes:png(),mime:'image/png'}],true)
  assert.equal(calls,2);assert.equal(result.items[0].price,null);assert.match(result.items[0].note,/90 vs 95/)
  calls=0;global.fetch=async()=>++calls===1?Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(first)}]}}]}):new Response('private upstream details',{status:429})
  await assert.rejects(provider().extractMenu([{bytes:png(),mime:'image/png'}],true),e=>e.status===429&&!e.message.includes('private'))
  assert.equal(calls,2)
  const images=[{bytes:png(),mime:'image/png'}];assert.notEqual(provider().menuImageFingerprint(images,true),provider().menuImageFingerprint(images,false))
})
test('upstream failures, refusals, truncation and invalid JSON produce safe recoverable errors without echoed secrets',async t=>{
  const old=global.fetch;t.after(()=>global.fetch=old)
  for(const [status,expected] of [[429,429],[403,503],[404,503],[500,502]]) {
    global.fetch=async()=>new Response('secret fixture-key',{status})
    await assert.rejects(provider().extractMenu([{bytes:png(),mime:'image/png'}]),e=>e.status===expected&&!e.message.includes('fixture-key'))
  }
  for(const value of [{candidates:[]},{candidates:[{finishReason:'MAX_TOKENS'}]},{candidates:[{finishReason:'STOP',content:{parts:[{text:'not JSON'}]}}]}]) {
    global.fetch=async()=>Response.json(value);await assert.rejects(provider().extractMenu([]),e=>e.status===422)
  }
  global.fetch=async()=>{throw new Error('network fixture-key')};await assert.rejects(provider().extractMenu([]),e=>e.status===504&&!e.message.includes('fixture-key'))
  await assert.rejects(provider({GEMINI_API_KEY:''}).extractMenu([]),e=>e.status===503)
  await assert.rejects(provider({GEMINI_MENU_MODEL:'../../evil'}).extractMenu([]),e=>e.status===503)
})
