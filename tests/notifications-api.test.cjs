const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto')
const {notificationFixture}=require('./helpers/notification-fixture.cjs'),{loadServer}=require('./helpers/load-server.cjs')
test('notification HTTP endpoints enforce sessions, origins, cursors, role-scoped mutations and safe tracking DTOs',async t=>{
  const h=await notificationFixture();t.after(()=>h.db.close());let actor=h.owner
  const rpc=async(name,args)=>{try{return {data:await h.call(name,args,actor),error:null}}catch(e){return {data:null,error:{code:e.code,message:e.message}}}}
  const overrides={
    '@/lib/supabase-server':{createSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:actor?{id:actor}:null}})},rpc})},
    '@/lib/supabase':{supabaseAdmin:()=>({rpc:async(name,args)=>{try{return {data:await h.call(name,args,null),error:null}}catch(e){return {data:null,error:{code:e.code}}}}})},
  }
  const env={SUPABASE_SERVICE_ROLE_KEY:'isolated-fixture',WEB_PUSH_PUBLIC_KEY:'configured-test-key',WEB_PUSH_PRIVATE_KEY:'configured-test-private-key',WEB_PUSH_SUBJECT:'mailto:fixture@example.test'}
  const api=loadServer('app/api/notifications/route.ts',overrides,env),push=loadServer('app/api/notifications/push/route.ts',overrides,env),tracking=loadServer('app/api/public/orders/[token]/route.ts',overrides,env)
  const request=(path='',body,origin='https://notify.test',method=body?'POST':'GET')=>new Request(`https://notify.test/api/notifications${path}`,{method,headers:{'Content-Type':'application/json',Origin:origin},...(body?{body:JSON.stringify(body)}:{})})
  actor=null;assert.equal((await api.GET(request(`?restaurant=${h.restaurant}`))).status,401)
  actor=h.owner;assert.equal((await api.GET(request('?restaurant=invalid'))).status,400)
  assert.equal((await api.GET(request(`?restaurant=${h.otherRestaurant}`))).status,403)
  assert.equal((await api.GET(request(`?restaurant=${h.restaurant}&before=-1`))).status,400)
  assert.equal((await api.POST(request(`?restaurant=${h.restaurant}`,{action:'read_all',cutoff:'0'},'https://evil.test'))).status,403)
  const order=await h.submit(),response=await api.GET(request(`?restaurant=${h.restaurant}`)),feed=await response.json()
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(feed.unread,2)
  actor=h.roles.kitchen
  const settings={reminders_enabled:true,first_seconds:120,escalation_seconds:300,repeat_seconds:300,max_repeats:2,feedback_threshold:2}
  assert.equal((await api.POST(request(`?restaurant=${h.restaurant}`,{action:'settings',data:settings}))).status,403)
  assert.equal((await push.POST(request(`?restaurant=${h.restaurant}`,{device:randomUUID(),subscription:{endpoint:'https://127.0.0.1/secret',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}}}))).status,400)
  const publicResponse=await tracking.GET(new Request(`https://notify.test/api/public/orders/${order.public_token}`),{params:Promise.resolve({token:order.public_token})})
  assert.equal(publicResponse.status,200);assert.equal(publicResponse.headers.get('referrer-policy'),'no-referrer')
  const body=await publicResponse.json();assert.equal(body.order.status,'pending');assert.equal(JSON.stringify(body).includes('Private kitchen note'),false);assert.equal(JSON.stringify(body).includes('9999999999'),false)
  assert.equal((await tracking.GET(new Request('https://notify.test/'),{params:Promise.resolve({token:randomUUID()})})).status,404)
  assert.equal((await tracking.GET(new Request('https://notify.test/'),{params:Promise.resolve({token:'not-a-token'})})).status,404)
})
test('scheduled work requires an exact configured secret; unauthorized calls do not run the worker',async()=>{
  let calls=0
  const api=loadServer('app/api/notifications/jobs/route.ts',{'@/lib/notification-worker':{runNotificationWorker:async()=>{calls++;return {dispatched:1}}}},{CRON_SECRET:'s'.repeat(40)})
  for(const authorization of ['',`Bearer ${'x'.repeat(40)}`,`Bearer ${'é'.repeat(40)}`])assert.equal((await api.GET(new Request('https://notify.test/api/notifications/jobs',{headers:{authorization}}))).status,401)
  assert.equal(calls,0)
  assert.equal((await api.POST(new Request('https://notify.test/api/notifications/jobs',{method:'POST',headers:{authorization:`Bearer ${'s'.repeat(40)}`}}))).status,200)
  assert.equal(calls,1)
})
