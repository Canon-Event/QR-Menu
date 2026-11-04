// Actual route handlers, provider HTTP client, HMAC and PostgreSQL. Only the
// external provider and Supabase transport/auth session are replaced.
const http = require('node:http'), { randomUUID,createHmac } = require('node:crypto')
const {loadServer}=require('./load-server.cjs')
async function paymentFixture(h) {
  const account={keyId:'rzp_test_fixture',keySecret:'fixture-secret-only-1234',webhookSecret:'fixture-webhook-only-1234'}
  const orders=new Map(),payments=new Map(),refunds=new Map(),calls=[]
  let loseOrderResponse=false,loseRefundResponse=false,nextRefundStatus='processed', failOrderStatus=0
  const server=http.createServer(async(req,res)=>{
    try {
      if(req.headers.authorization!==`Basic ${Buffer.from(`${account.keyId}:${account.keySecret}`).toString('base64')}`) {res.writeHead(401); return res.end('{}')}
      const url=new URL(req.url,'http://fixture'),chunks=[];for await(const c of req)chunks.push(c)
      const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):null
      calls.push({method:req.method,path:url.pathname,query:url.search,body})
      let data
      if(req.method==='POST'&&url.pathname==='/v1/orders') {
        if(failOrderStatus){res.writeHead(failOrderStatus);failOrderStatus=0;return res.end('{}')}
        data={...body,id:'order_'+randomUUID().replaceAll('-',''),status:'created'};orders.set(data.id,data)
        if(loseOrderResponse){loseOrderResponse=false;return req.socket.destroy()}
      } else if(url.pathname==='/v1/orders') data={items:[...orders.values()].filter(o=>!url.searchParams.has('receipt')||o.receipt===url.searchParams.get('receipt'))}
      else if(req.method==='GET'&&url.pathname.startsWith('/v1/payments/')&&!url.pathname.endsWith('/refunds')) data=payments.get(url.pathname.split('/').at(-1))
      else if(req.method==='POST'&&url.pathname.endsWith('/refund')) {
        data={id:'rfnd_'+randomUUID().replaceAll('-',''),payment_id:url.pathname.split('/')[3],amount:body.amount,currency:'INR',notes:body.notes,status:nextRefundStatus};refunds.set(data.id,data)
        if(loseRefundResponse){loseRefundResponse=false;return req.socket.destroy()}
      } else if(url.pathname.endsWith('/refunds')) data={items:[...refunds.values()].filter(r=>r.payment_id===url.pathname.split('/')[3])}
      else if(url.pathname.startsWith('/v1/refunds/')) data=refunds.get(url.pathname.split('/').at(-1))
      if(!data){res.writeHead(404);return res.end('{}')};res.setHeader('content-type','application/json');res.end(JSON.stringify(data))
    } catch {res.writeHead(500);res.end('{}')}
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const nativeFetch=global.fetch
  global.fetch=(url,options)=>{
    if(!String(url).startsWith('https://api.razorpay.com/v1/')) throw new Error('Unexpected outbound request in isolated test')
    return nativeFetch(String(url).replace('https://api.razorpay.com',`http://127.0.0.1:${server.address().port}`),options)
  }
  let actor=h.owner
  async function rpc(name,args) {
    await h.as(actor)
    try {
      const names=Object.keys(args),values=names.map(k=>typeof args[k]==='object'&&args[k]!==null?JSON.stringify(args[k]):args[k])
      const placeholders=names.map((n,i)=>`${n} => $${i+1}`).join(',')
      return {data:(await h.db.query(`select public.${name}(${placeholders}) result`,values)).rows[0].result,error:null}
    } catch(e) {return {data:null,error:{code:e.code,message:e.message}}}
  }
  const supabase={rpc}
  const env={POS_RAZORPAY_ACCOUNTS:JSON.stringify({[h.restaurant]:account}),SUPABASE_SERVICE_ROLE_KEY:'isolated-fixture-only',TABLE_ACCESS_HASH_SECRET:'isolated-table-access-secret-only-1234'}
  const overrides={
    '@/lib/supabase':{supabaseAdmin:()=>({rpc:async(name,args)=>{
      try{
        if(['orders_submit','orders_submit_table','table_access_guest'].includes(name)) {
          await h.as(null,'service_role');const values=Object.values(args).map(v=>typeof v==='object'&&v!==null?JSON.stringify(v):v)
          return {data:(await h.db.query(`select ${name}(${Object.keys(args).map((k,i)=>`${k} => $${i+1}`).join(',')}) result`,values)).rows[0].result,error:null}
        }
        return {data:await h.gateway(args.p_action,args.p_data),error:null}
      }catch(e){return {data:null,error:{code:e.code,message:e.message}}}
    }})},
    '@/lib/supabase-server':{createSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:actor?{id:actor}:null}})},rpc})},
  }
  // Owner lookup is a transport fixture only; database authorization stays real.
  const actualMenu=loadServer('lib/menu-api.ts',overrides,env)
  overrides['@/lib/menu-api']={...actualMenu,getOwnedRestaurant:async()=>actor?{supabase,restaurantId:h.restaurant}:{error:Response.json({error:'Sign in'},{status:401})}}
  const cache=new Map(),load=file=>loadServer(file,overrides,env,cache)
  const api={checkout:load('app/api/public/billing/checkout/route.ts'),verify:load('app/api/public/billing/verify/route.ts'),webhook:load('app/api/payments/razorpay/webhook/[restaurantId]/route.ts'),billing:load('app/api/billing/route.ts'),publicBill:load('app/api/public/billing/[token]/route.ts'),publicOrders:load('app/api/public/orders/route.ts'),staff:load('app/api/staff/route.ts'),staffBilling:load('app/api/staff/billing/route.ts'),staffOrders:load('app/api/staff/orders/route.ts'),team:load('app/api/team/route.ts')}
  api.tableGuest=load('app/api/public/table-access/route.ts')
  api.tableStaff=load('app/api/table-access/route.ts')
  const request=(path,body,method='POST',headers={})=>{const normalized=new Headers(headers);if(!normalized.has('Content-Type'))normalized.set('Content-Type','application/json');return new Request(`https://shift.test${path}`,{method,headers:normalized,...(body===undefined?{}:{body:JSON.stringify(body)})})}
  async function checkout(token,key=randomUUID()) {const response=await api.checkout.POST(request('/api/public/billing/checkout',{token,request_key:key}));return {response,data:await response.json()}}
  function payment(orderId,change={}) {
    const o=orders.get(orderId),p={id:'pay_'+randomUUID().replaceAll('-',''),order_id:orderId,amount:o.amount,currency:'INR',captured:true,status:'captured',...change};payments.set(p.id,p)
    return {...p,signature:createHmac('sha256',account.keySecret).update(`${orderId}|${p.id}`).digest('hex')}
  }
  async function webhook(event,entity,signature=true) {
    const kind=event.startsWith('refund.')?'refund':'payment',raw=JSON.stringify({event,payload:{[kind]:{entity}}})
    return api.webhook.POST(new Request(`https://shift.test/api/payments/razorpay/webhook/${h.restaurant}`,{method:'POST',body:raw,headers:{'x-razorpay-signature':signature?createHmac('sha256',account.webhookSecret).update(raw).digest('hex'):'0'.repeat(64)}}),{params:Promise.resolve({restaurantId:h.restaurant})})
  }
  let queue=Promise.resolve()
  function runAs(id, fn) { const result=queue.then(async()=>{actor=id;return fn()});queue=result.catch(()=>{});return result }
  return {api,account,request,rpc,orders,payments,refunds,calls,checkout,payment,webhook,runAs,setActor:id=>{actor=id},loseNextOrder:()=>{loseOrderResponse=true},loseNextRefund:()=>{loseRefundResponse=true},rejectNextOrder:status=>{failOrderStatus=status},pendingRefund:()=>{nextRefundStatus='pending'},close:async()=>{global.fetch=nativeFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}
}
module.exports={paymentFixture}
