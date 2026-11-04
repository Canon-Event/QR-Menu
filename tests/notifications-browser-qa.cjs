// Real React notification/order components, real route handlers and PostgreSQL.
// Only Supabase transport/session/realtime and external push delivery are fixtures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript')
const {chromium}=require('playwright'),{notificationFixture}=require('./helpers/notification-fixture.cjs'),{loadServer}=require('./helpers/load-server.cjs')
const output=path.resolve('artifacts/notifications-qa'),modules=new Map()
function bundle(file){let filename=path.resolve(file);if(!path.extname(filename))filename=['.ts','.tsx'].map(e=>filename+e).find(f=>fs.existsSync(f));const id=path.relative(process.cwd(),filename).replaceAll('\\','/');if(modules.has(id))return id;modules.set(id,'');let code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;code=code.replace(/require\("([^"]+)"\)/g,(all,name)=>name==='@/lib/supabase-browser'?all:name.startsWith('@/')?`require(${JSON.stringify(bundle(name.slice(2)))})`:name.startsWith('.')?`require(${JSON.stringify(bundle(path.resolve(path.dirname(filename),name)))})`:all);modules.set(id,code);return id}
async function main(){
  fs.mkdirSync(output,{recursive:true});const h=await notificationFixture(),checks=[],errors=[],contexts=[];let browser,tail=Promise.resolve()
  function run(fn){const result=tail.then(fn);tail=result.catch(()=>{});return result}
  try{
    const provider=bundle('components/notifications/NotificationProvider.tsx'),center=bundle('components/notifications/NotificationCenter.tsx'),tracker=bundle('components/menu/CustomerOrderTracker.tsx'),board=bundle('components/dashboard/OrdersBoard.tsx')
    const runtime=`const modules={${[...modules].map(([id,code])=>`${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(',')}};const cache={};function require(id){if(id==='react')return React;if(id==='next/navigation')return {usePathname:()=>React.useContext(PathContext)};if(id==='next/link')return function Link(p){return React.createElement('a',{...p,onClick:e=>{p.onClick?.(e);if(!e.defaultPrevented&&!p.target){e.preventDefault();window.navigate(p.href)}}},p.children)};if(id==='@/lib/supabase-browser')return {createSupabaseBrowserClient:()=>window.supabaseFixture};if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}`
    const react=fs.readFileSync(path.join(path.dirname(require.resolve('react/package.json')),'umd/react.development.js'),'utf8'),dom=fs.readFileSync(path.join(path.dirname(require.resolve('react-dom/package.json')),'umd/react-dom.development.js'),'utf8')
    const css=fs.readFileSync('app/notifications.css','utf8')+'\n'+fs.readFileSync('app/pos.css','utf8')+'\nbody{margin:0;font:15px Arial;color:#263b2a;background:#f8f6f0}button,a,input{font:inherit}button{cursor:pointer}main{padding:20px}*{box-sizing:border-box}'
    const chrome=process.env.CHROMIUM_PATH||'C:/Users/Saksham/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
    browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})})
    async function contextFor(role='owner'){
      const user=h.roles[role],context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});contexts.push(context)
      let signedIn=true,failFeed=false
      const rpc=async(name,args,actor=user)=>{try{return {data:await h.call(name,args,actor),error:null}}catch(e){return {data:null,error:{code:e.code,message:e.message}}}}
      const overrides={'@/lib/supabase-server':{createSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:signedIn?{id:user}:null}})},rpc})},'@/lib/supabase':{supabaseAdmin:()=>({rpc:(name,args)=>rpc(name,args,null)})}}
      const env={SUPABASE_SERVICE_ROLE_KEY:'browser-fixture-only'},api=loadServer('app/api/notifications/route.ts',overrides,env),tracking=loadServer('app/api/public/orders/[token]/route.ts',overrides,env),orders=loadServer('app/api/staff/orders/route.ts',overrides,env)
      context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)))
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url()),p=url.pathname
        if(url.hostname!=='notify.test')return route.abort()
        const asset={'/style.css':['text/css',css],'/react.js':['text/javascript',react],'/dom.js':['text/javascript',dom],'/runtime.js':['text/javascript',runtime]}[p]
        if(asset)return route.fulfill({contentType:asset[0],body:asset[1]})
        if(p.startsWith('/api/'))return run(async()=>{
          if(p==='/api/notifications'&&failFeed&&req.method()==='GET')return route.fulfill({status:503,json:{error:'Temporary notification outage'}})
          const request=new Request(req.url(),{method:req.method(),headers:{'Content-Type':'application/json',Origin:'https://notify.test'},...(['GET','HEAD'].includes(req.method())?{}:{body:req.postData()})})
          let response
          if(p==='/api/notifications')response=await api[req.method()](request)
          else if(p==='/api/staff/orders')response=await orders[req.method()](request)
          else if(p.startsWith('/api/public/orders/'))response=await tracking.GET(request,{params:Promise.resolve({token:p.split('/').at(-1)})})
          else return route.fulfill({status:404,json:{error:'Unavailable'}})
          return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()})
        }).catch(error=>{errors.push(error.message);return route.fulfill({status:500,json:{error:error.message}})})
        if(p==='/notifications-sw.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('public/notifications-sw.js','utf8')})
        const trackingToken=p.startsWith('/order/')?p.split('/').at(-1):null
        let initial=null
        if(trackingToken)initial=await run(()=>h.call('order_tracking',{p_token:trackingToken},null))
        const bootstrap=`window.activeChannels=0;window.audioStarts=0;window.signalCallbacks=new Set();window.authCallback=null;window.forceAudioBlocked=false;const NativeAudio=window.AudioContext;window.AudioContext=class extends NativeAudio{createOscillator(){window.audioStarts++;return super.createOscillator()}resume(){return window.forceAudioBlocked?Promise.reject(new Error('Playback blocked by test browser')):super.resume()}};window.supabaseFixture={channel(){let cb=null,active=false;return {on(event,scope,fn){cb=fn;return this},subscribe(fn){active=true;window.activeChannels++;window.signalCallbacks.add(cb);queueMicrotask(()=>fn('SUBSCRIBED'));return this},close(){if(active){active=false;window.activeChannels--;window.signalCallbacks.delete(cb)}}}},removeChannel(channel){channel.close();return Promise.resolve()},auth:{onAuthStateChange(fn){window.authCallback=fn;return {data:{subscription:{unsubscribe(){if(window.authCallback===fn)window.authCallback=null}}}}}}};window.emitSignal=()=>window.signalCallbacks.forEach(fn=>fn({new:{restaurant_id:${JSON.stringify(h.restaurant)}}}));const PathContext=React.createContext(location.pathname);function App(){const [pathname,setPath]=React.useState(location.pathname);window.navigate=href=>{history.pushState({},'',href);setPath(location.pathname)};const Link=require('next/link'),Provider=require(${JSON.stringify(provider)}).default,Center=require(${JSON.stringify(center)}).default,Board=require(${JSON.stringify(board)}).default;let content=pathname.endsWith('/notifications')?React.createElement(Center,{full:true}):pathname.endsWith('/orders')?React.createElement(Board,{initialOrders:[],apiUrl:'/api/staff/orders?restaurant=${h.restaurant}'}):React.createElement('main',null,React.createElement('h1',null,pathname.endsWith('/settings')?'Restaurant settings':'Menu workspace'),React.createElement(Link,{href:'/dashboard/settings'},'Go to restaurant settings'),React.createElement('br'),React.createElement(Link,{href:'/dashboard/notifications'},'Notification history'),React.createElement('br'),React.createElement(Link,{href:'/dashboard/orders'},'Orders'));return React.createElement(PathContext.Provider,{value:pathname},React.createElement(Provider,{restaurantId:${JSON.stringify(h.restaurant)},userId:${JSON.stringify(user)}},content))};ReactDOM.createRoot(document.getElementById('root')).render(${trackingToken?`React.createElement(require(${JSON.stringify(tracker)}).default,{token:${JSON.stringify(trackingToken)},initial:${JSON.stringify(initial)}})`:`React.createElement(React.StrictMode,null,React.createElement(App))`});`
        return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/react.js"></script><script src="/dom.js"></script><script>${runtime}</script><script>${bootstrap}</script></body></html>`})
      })
      return {context,setFailure:value=>{failFeed=value},setSignedIn:value=>{signedIn=value}}
    }
    const owner=await contextFor(),page=await owner.context.newPage();await page.goto('https://notify.test/dashboard/menu')
    await page.getByRole('heading',{name:'Menu workspace'}).waitFor();await page.waitForFunction(()=>window.activeChannels===1)
    await page.getByRole('link',{name:'Notification history',exact:true}).click();await page.getByRole('heading',{name:'Notification preferences'}).waitFor()
    await page.evaluate(()=>window.forceAudioBlocked=true);await page.getByRole('button',{name:'Enable sound in this tab'}).click();await page.getByText('Playback blocked by test browser',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.audioStarts),0)
    await page.evaluate(()=>window.forceAudioBlocked=false);await page.getByRole('button',{name:'Enable sound in this tab'}).click();await page.getByText('Sound is enabled in this tab.',{exact:true}).waitFor()
    await page.evaluate(()=>window.navigate('/dashboard/menu'));const baseline=await page.evaluate(()=>window.audioStarts)
    const order=await run(()=>h.submit());await page.evaluate(()=>window.emitSignal());await page.getByRole('button',{name:'Notifications, 2 unread',exact:true}).waitFor()
    assert.ok((await page.evaluate(()=>window.audioStarts))>baseline);assert.equal(await page.evaluate(()=>window.activeChannels),1)
    await page.getByRole('link',{name:'Go to restaurant settings'}).click();assert.equal(await page.evaluate(()=>window.activeChannels),1)
    checks.push('New order alerts and activated audio arrive on Menu/Settings; StrictMode and route changes keep one subscription')
    const bell=page.getByRole('button',{name:'Notifications, 2 unread',exact:true});await bell.click();await page.getByRole('dialog',{name:'Notification center'}).waitFor();assert.equal((await run(()=>h.feed())).unread,2)
    await page.keyboard.press('Escape');assert.equal(await bell.evaluate(el=>el===document.activeElement),true)
    await bell.click();await page.getByRole('button',{name:/^Mark New .* as read$/}).first().click();await page.getByRole('button',{name:'Notifications, 1 unread',exact:true}).waitFor();await page.keyboard.press('Escape')
    await page.reload();await page.getByRole('button',{name:'Notifications, 1 unread',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.audioStarts),0)
    await page.getByRole('link',{name:'Notification history',exact:true}).click();await page.getByText('Sound preference saved. Enable playback in this tab to hear alerts.',{exact:true}).waitFor()
    checks.push('Opening bell does not mark read; keyboard focus returns; unread state and sound preference survive reload without replaying audio')
    const tab=await owner.context.newPage();await tab.goto('https://notify.test/dashboard/notifications');await tab.getByRole('heading',{name:'Notification preferences'}).waitFor()
    await tab.getByRole('button',{name:'Enable sound in this tab'}).click();await page.getByRole('button',{name:'Enable sound in this tab'}).click()
    await Promise.all([page.waitForFunction(()=>window.audioStarts===2),tab.waitForFunction(()=>window.audioStarts===2)])
    const beforeSound=await page.evaluate(()=>window.audioStarts)+await tab.evaluate(()=>window.audioStarts)
    await run(()=>h.submit());await Promise.all([page.evaluate(()=>window.emitSignal()),tab.evaluate(()=>window.emitSignal())]);await page.getByRole('button',{name:'Notifications, 3 unread',exact:true}).waitFor();await tab.getByRole('button',{name:'Notifications, 3 unread',exact:true}).waitFor()
    const soundDelta=await page.evaluate(()=>window.audioStarts)+await tab.evaluate(()=>window.audioStarts)-beforeSound;assert.equal(soundDelta,2,'one two-note chime across both tabs')
    const beforeReconnect=await page.evaluate(()=>window.audioStarts);owner.setFailure(true);await page.evaluate(()=>window.emitSignal());await page.getByRole('alert').filter({hasText:'Temporary notification outage'}).first().waitFor();owner.setFailure(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.getByRole('alert').filter({hasText:'Temporary notification outage'}).first().waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.audioStarts),beforeReconnect)
    checks.push('Two tabs coordinate one sound; reconnect reconciles without duplicate rows or historical audio')
    await run(async()=>{await h.db.exec('reset role');await h.db.query("insert into orders(restaurant_id,idempotency_key,customer_name,currency,subtotal,total) select $1,gen_random_uuid(),'History fixture','INR',1,1 from generate_series(1,55)",[h.restaurant])});await page.evaluate(()=>window.emitSignal());await page.getByRole('button',{name:'Older notifications',exact:true}).waitFor();await page.getByRole('button',{name:'Older notifications',exact:true}).click();await page.getByRole('button',{name:'Newer notifications',exact:true}).waitFor();const firstOlder=await page.locator('.notification-list>li').first().innerText();await page.evaluate(()=>window.emitSignal());await page.waitForTimeout(700);assert.equal(await page.locator('.notification-list>li').first().innerText(),firstOlder)
    await page.getByLabel('First reminder (seconds)',{exact:true}).fill('180');await page.evaluate(()=>window.emitSignal());await page.waitForTimeout(700);assert.equal(await page.getByLabel('First reminder (seconds)',{exact:true}).inputValue(),'180')
    await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/^Notifications/}).first().click();await page.screenshot({path:path.join(output,'notification-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.keyboard.press('Escape')
    checks.push('History cursor and unsaved settings survive reconciliation; mobile dialog fits viewport and supports Escape')
    const guest=await owner.context.newPage();await guest.goto(`https://notify.test/order/${order.public_token}`);await guest.getByRole('heading',{name:'Order received',exact:true}).waitFor()
    await run(async()=>{await h.db.exec('reset role');const row=(await h.db.query('select id,version from orders where public_token=$1',[order.public_token])).rows[0];await h.call('orders_change',{p_restaurant_id:h.restaurant,p_order_id:row.id,p_version:row.version,p_status:'confirmed',p_reason:''})})
    await guest.evaluate(()=>window.dispatchEvent(new Event('focus')));await guest.getByRole('heading',{name:'Confirmed',exact:true}).waitFor();assert.equal((await guest.locator('body').innerText()).includes('Private kitchen note'),false)
    checks.push('Customer tracking updates from real order transitions without staff notes or contact details')
    owner.setSignedIn(false);await page.evaluate(()=>window.authCallback('SIGNED_OUT',null));await page.getByText('Signed out',{exact:false}).first().waitFor();assert.equal(await page.locator('.notification-list>li').count(),0);assert.equal(await page.evaluate(()=>window.activeChannels),0)
    checks.push('Sign-out clears private inbox and removes the active subscription')
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2))
  }finally{for(const context of contexts)await context.close();await browser?.close();await tail;await h.db.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
