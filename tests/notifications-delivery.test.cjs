const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto')
const {notificationFixture}=require('./helpers/notification-fixture.cjs'),{paymentFixture}=require('./helpers/payment-fixture.cjs'),{loadServer}=require('./helpers/load-server.cjs'),{loadTypeScript}=require('./helpers/load-typescript.cjs')
test('verified payment/refund webhook replays create one financial alert and opening it never changes money',async t=>{
  const h=await notificationFixture(),f=await paymentFixture(h);t.after(async()=>{await f.close();await h.db.close()})
  await h.as(h.owner);const bill=await h.ownerAction('issue',{items:[{dish_id:h.dish,quantity:1}],request_key:randomUUID()})
  const checkout=await f.checkout(bill.public_token),payment=f.payment(checkout.data.orderId)
  assert.equal((await f.webhook('payment.captured',payment)).status,200)
  const duplicatePayment=f.payment(checkout.data.orderId)
  assert.equal((await f.webhook('payment.captured',duplicatePayment,false)).status,400)
  assert.equal((await f.webhook('payment.captured',duplicatePayment)).status,200)
  assert.equal((await f.webhook('payment.captured',duplicatePayment)).status,200)
  let feed=await h.feed(),alerts=feed.items.filter(n=>n.type==='payment.discrepancy');assert.equal(alerts.length,1)
  await h.as(h.owner);const before=await h.ownerAction('state',{bill_id:bill.id})
  await h.call('notification_open',{p_restaurant_id:h.restaurant,p_id:alerts[0].id})
  await h.as(h.owner);assert.deepEqual(await h.ownerAction('state',{bill_id:bill.id}),before)
  f.pendingRefund()
  const body={action:'refund',data:{payment_id:before.payments[0].id,amount_paise:100,reason:'Provider failure fixture',request_key:randomUUID()}}
  assert.equal((await f.api.billing.POST(f.request('/api/billing',body))).status,200)
  assert.equal((await h.feed()).items.filter(n=>n.type==='refund.failed').length,0,'pending is not a confirmed failure')
  const refund=[...f.refunds.values()][0]
  assert.equal((await f.webhook('refund.failed',{...refund,status:'failed'})).status,200)
  assert.equal((await f.webhook('refund.failed',{...refund,status:'failed'})).status,200)
  assert.equal((await h.feed()).items.filter(n=>n.type==='refund.failed').length,1)
  for(const role of ['waiter','cashier','kitchen'])assert.equal((await h.feed(h.roles[role])).items.filter(n=>n.category==='billing').length,0)
  assert.equal((await h.feed(h.roles.manager)).items.filter(n=>n.category==='billing').length,2)
})
test('push sender applies timeouts, opaque payloads, provider status accounting and bounded parallelism',async()=>{
  const jobs=Array.from({length:9},()=>({id:randomUUID(),lease:randomUUID(),subscription_id:randomUUID(),inbox_id:randomUUID(),restaurant_id:randomUUID(),endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh:'A'.repeat(87),auth:'B'.repeat(22)}))
  const finishes=[];let active=0,maxActive=0,calls=0,claims=0
  const api=loadServer('lib/notification-worker.ts',{
    '@/lib/supabase':{supabaseAdmin:()=>({rpc:async(name,args)=> name==='notification_tick'?{data:{dispatched:1},error:null}:name==='notification_push_claim'?{data:claims++<2?jobs.slice(claims===1?0:5,claims===1?5:9):[],error:null}:(finishes.push(args),{data:null,error:null})})},
    'web-push':{sendNotification:async(subscription,payload,options)=>{
      active++;maxActive=Math.max(active,maxActive);const call=calls++;await new Promise(resolve=>setTimeout(resolve,5));active--
      assert.equal(options.timeout,5000);assert.equal(options.TTL,300);assert.equal(options.topic.length,32);assert.deepEqual(Object.keys(JSON.parse(payload)).sort(),['id','subscription'])
      if(call===0)throw {statusCode:410};if(call===1)throw {statusCode:503};return {statusCode:201}
    }},
  },{WEB_PUSH_PUBLIC_KEY:'public-test',WEB_PUSH_PRIVATE_KEY:'private-test',WEB_PUSH_SUBJECT:'mailto:test@example.test'})
  const result=await api.runNotificationWorker();assert.equal(result.sent,7);assert.equal(result.failed,2);assert.ok(maxActive<=4);assert.equal(claims,3);assert.equal(finishes.length,9);assert.ok(finishes.some(f=>f.p_status===410))
})
test('catch-up sound ignores old history, resolved work, read records and disabled categories',()=>{
  const {freshAudible,notificationBackoff,safeInternalHref}=loadTypeScript('lib/notifications.ts'),now=new Date().toISOString()
  const base={id:randomUUID(),cursor:'1',read_at:null,type:'order.new',category:'orders',severity:'info',metadata:{},created_at:now,actionable:true}
  const items=[base,{...base,id:randomUUID(),created_at:'2020-01-01T00:00:00Z'},{...base,id:randomUUID(),read_at:now},{...base,id:randomUUID(),actionable:false},{...base,id:randomUUID(),category:'billing'},{...base,id:randomUUID(),severity:'urgent',type:'order.escalation'}]
  const result=freshAudible(items,{categories:['orders'],sound_enabled:true,volume:.5,push_enabled:false},now)
  assert.equal(result.length,2);assert.equal(result[0].type,'order.escalation');assert.equal(notificationBackoff(10),60000)
  assert.equal(safeInternalHref('/staff/abc/notifications/123'),true)
  for(const path of ['//evil.test','https://evil.test','/staff\\evil','javascript:alert(1)','/api/payments'])assert.equal(safeInternalHref(path),false)
})

test('audio fallback releases its lease, accepts distinct events and rejects duplicate cursors',async()=>{
  const vm=require('node:vm'),fs=require('node:fs'),ts=require('typescript'),storage=new Map(),exports={}
  const sandbox={exports,require:()=>({}),document:{hidden:false},navigator:{},crypto:{randomUUID},setTimeout,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/notification-audio.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox)
  let played=0;const claim=cursor=>exports.claimNotificationSound('fixture',[{cursor}],()=>played++)
  assert.equal(await claim('1'),true);assert.equal(await claim('2'),true);assert.equal(await claim('2'),false);assert.equal(played,2)
  assert.equal(storage.has('qrush:audio:fixture:lease'),false)
  sandbox.document.hidden=true;assert.equal(await claim('3'),false)
})

test('service worker rechecks access, suppresses only acknowledged foreground alerts and validates clicks',async()=>{
  const vm=require('node:vm'),fs=require('node:fs'),handlers={},shown=[],opened=[],seen=new Set()
  let permitted=true,visible=[],failDisplay=false
  const id=randomUUID(),subscription=randomUUID(),restaurant=randomUUID(),href=`/staff/${restaurant}/notifications/${id}`
  const context=vm.createContext({setTimeout,clearTimeout,MessageChannel,fetch:async()=>({ok:permitted,json:async()=>({show:true,href})}),self:{addEventListener:(name,fn)=>handlers[name]=fn,clients:{matchAll:async()=>visible,openWindow:async path=>opened.push(path)},registration:{showNotification:async(title,options)=>{if(failDisplay)throw Error('display failure');shown.push({title,...options})}}}})
  vm.runInContext(fs.readFileSync('public/notifications-sw.js','utf8'),context)
  // Storage durability is browser-owned; isolate display/routing behavior here.
  context.seen=seen;vm.runInContext('once=async id=>{if(seen.has(id))return false;seen.add(id);return true};forget=async id=>{seen.delete(id)}',context)
  async function push(){let work;handlers.push({data:{json:()=>({id,subscription})},waitUntil:p=>work=p});await work}
  permitted=false;await push();assert.equal(shown.length,0)
  permitted=true;visible=[{visibilityState:'visible',postMessage:(data,ports)=>{assert.equal(data.restaurantId,restaurant);ports[0].postMessage({received:true});ports[0].close()}}]
  await push();assert.equal(shown.length,0);assert.equal(seen.size,0)
  visible=[];failDisplay=true;await push();assert.equal(seen.size,0,'failed native display can be retried')
  failDisplay=false;await push();await push();assert.equal(shown.length,1);assert.equal(shown[0].title,'Restaurant update');assert.equal(shown[0].tag,id)
  let work;handlers.notificationclick({notification:{close(){},data:{href:'https://evil.test'}},waitUntil:p=>work=p});assert.equal(opened.length,0)
  handlers.notificationclick({notification:{close(){},data:{href}},waitUntil:p=>work=p});await work;assert.deepEqual(opened,[href])
})
