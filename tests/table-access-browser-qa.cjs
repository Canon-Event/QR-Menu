// Isolated real React/API/PostgreSQL verification with independent browser cookies.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),{randomUUID}=require('node:crypto')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),postcss=require('postcss'),tailwind=require('tailwindcss')
const {posDatabase}=require('./helpers/pos-database.cjs'),{paymentFixture}=require('./helpers/payment-fixture.cjs'),{loadTypeScript}=require('./helpers/load-typescript.cjs')
const output=path.resolve('artifacts/table-access-qa'),modules=new Map()
function bundle(file){let filename=path.resolve(file);if(!path.extname(filename))filename=['.ts','.tsx'].map(e=>filename+e).find(f=>fs.existsSync(f));const id=path.relative(process.cwd(),filename).replaceAll('\\','/');if(modules.has(id))return id;modules.set(id,'');let code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;code=code.replace(/require\("([^"]+)"\)/g,(all,name)=>name.startsWith('@/')?`require(${JSON.stringify(bundle(name.slice(2)))})`:name.startsWith('.')?`require(${JSON.stringify(bundle(path.resolve(path.dirname(filename),name)))})`:all);modules.set(id,code);return id}
async function main(){
 fs.mkdirSync(output,{recursive:true});const h=await posDatabase(),f=await paymentFixture(h),checks=[],errors=[],contexts=[];let browser
 try{
  const waiterId=randomUUID();await h.db.exec('reset role');await h.db.query("update restaurants set menu_mode='ordering' where id=$1",[h.restaurant]);await h.db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'waiter@table.test',now())",[waiterId])
  await h.as(h.owner);await h.ownerAction('settings',h.settings);await h.db.query("select team_admin($1,'grant',$2::jsonb)",[h.restaurant,JSON.stringify({email:'waiter@table.test',name:'Waiter',role:'waiter'})])
  const table=await h.ownerAction('table_create',{name:'Table 5',seats:4}),other=await h.ownerAction('table_create',{name:'Table 6',seats:2}),visit=await h.ownerAction('visit_open',{table_id:table.id,guest_name:'Dinner'})
  const scans=(await h.db.query('select id,scan_token from pos_tables')).rows;table.scan=scans.find(t=>t.id===table.id).scan_token;other.scan=scans.find(t=>t.id===other.id).scan_token
  const guestId=bundle('components/menu/CustomerMenuActions.tsx'),staffId=bundle('components/staff/TableAccessPanel.tsx')
  const runtime=`const modules={${[...modules].map(([id,code])=>`${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(',')}};const cache={};function require(id){if(id==='react')return React;if(id==='qrcode')return {toDataURL:window.tableQr};if(id==='next/navigation')return {useRouter:()=>({push:url=>location.assign(url)})};if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}`
  const css=(await postcss([tailwind(loadTypeScript('tailwind.config.ts').default)]).process(['globals','responsive','dashboard-shell','pos'].map(n=>fs.readFileSync(`app/${n}.css`,'utf8')).join('\n'),{from:undefined})).css+'\nbody{margin:0}:root{--font-manrope:Arial;--font-dm-serif:Georgia}'
  const react=fs.readFileSync(path.join(path.dirname(require.resolve('react/package.json')),'umd/react.development.js'),'utf8'),dom=fs.readFileSync(path.join(path.dirname(require.resolve('react-dom/package.json')),'umd/react-dom.development.js'),'utf8')
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})})
  let loseOrder=true,offline=false
  async function pageFor(role){
   const actor=role==='owner'?h.owner:role==='waiter'?waiterId:null,context=await browser.newContext({viewport:{width:1280,height:1000}});contexts.push(context)
   await context.exposeFunction('tableQr',url=>require('qrcode').toDataURL(url,{width:240,margin:2}))
   context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)))
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url()),p=url.pathname,method=route.request().method()
    if(url.hostname!=='shift.test')return route.abort()
    const asset={'/style.css':['text/css',css],'/react.js':['text/javascript',react],'/dom.js':['text/javascript',dom],'/runtime.js':['text/javascript',runtime]}[p]
    if(asset)return route.fulfill({contentType:asset[0],body:asset[1]})
    if(p==='/api/public/visit')return route.fulfill({json:{ok:true}})
    return f.runAs(actor,async()=>{
     const body=method==='GET'?undefined:route.request().postDataJSON(),request=f.request(p+url.search,body,method,route.request().headers());let response
     if(p==='/api/table-access')response=await f.api.tableStaff[method](request)
     else if(p==='/api/public/table-access'){
      if(offline&&method==='GET')return route.fulfill({status:503,json:{error:'Connection interrupted'}})
      response=await f.api.tableGuest[method](request)
     }else if(p==='/api/public/orders')response=await f.api.publicOrders.POST(request)
     if(response){
      if(p==='/api/public/orders'&&response.ok&&loseOrder){loseOrder=false;return route.abort('failed')}
      return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()})
     }
     let render
     if(p.startsWith('/order/'))render=`React.createElement('h1',null,'Order received')`
     else if(role==='owner'||role==='waiter')render=`React.createElement('main',{className:'pos-app'},React.createElement(require(${JSON.stringify(staffId)}).default,${JSON.stringify({restaurantId:h.restaurant})}))`
     else {
      const props={restaurant:{id:h.restaurant,name:'Test restaurant',slug:'green-bistro',menu_mode:'ordering',currency:'INR',table_verification_required:true},dishes:[{id:h.dish,name:'Coffee',price:118}],tableScan:url.searchParams.get('table')}
      render=`React.createElement(React.Fragment,null,React.createElement('h1',null,'Test restaurant menu'),React.createElement(require(${JSON.stringify(guestId)}).default,${JSON.stringify(props)}))`
     }
     return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/react.js"></script><script src="/dom.js"></script><script src="/runtime.js"></script><script>ReactDOM.createRoot(document.getElementById('root')).render(${render})</script></body></html>`})
    })
   })
   const page=await context.newPage();return {page,context}
  }
  const {page:owner}=await pageFor('owner');await owner.goto('https://shift.test/dashboard/table-access');await owner.getByLabel('Require waiter approval for phone orders').click();await owner.getByText('Waiter verification setting saved.').waitFor();await owner.getByText('Table QR codes and approved phones',{exact:true}).click();await owner.getByAltText('Scan this table to request waiter approval').first().waitFor();checks.push('Owner enables verification and can open/download separate table QR codes')
  const {page:outside}=await pageFor('guest');await outside.goto('https://shift.test/menu/green-bistro');await outside.getByText(/Scan the QR code at your table/).waitFor();assert.equal(await outside.getByRole('button',{name:'Order now',exact:true}).isDisabled(),true)
  const {page:a,context:aContext}=await pageFor('guest'),tableUrl=`https://shift.test/menu/green-bistro?table=${table.scan}`;await a.goto(tableUrl);await a.locator('.table-verification-code').waitFor();const codeA=(await a.locator('.table-verification-code').innerText()).trim();assert.match(codeA,/^[0-9]{4}$/);assert.equal(await a.getByRole('button',{name:'Order now',exact:true}).isDisabled(),true)
  const cookies=await aContext.cookies();assert.equal(cookies.find(c=>c.name.startsWith('wiit_table_')).httpOnly,true);assert.equal((await a.evaluate(()=>document.cookie)).includes('wiit_table_'),false)
  await a.reload();await a.locator('.table-verification-code').waitFor();assert.equal((await a.locator('.table-verification-code').innerText()).trim(),codeA);checks.push('Public browsing cannot order; table scan shows four digits, reload keeps the code, and the private cookie is HttpOnly')
  const {page:b}=await pageFor('guest');await b.goto(tableUrl);await b.locator('.table-verification-code').waitFor();const codeB=(await b.locator('.table-verification-code').innerText()).trim();assert.notEqual(codeA,codeB)
  const {page:waiter}=await pageFor('waiter');await waiter.goto('https://shift.test/staff/table-access');await waiter.getByLabel('Guest four-digit code').waitFor();assert.equal(await waiter.getByLabel('Require waiter approval for phone orders').count(),0)
  async function approve(code){await waiter.getByLabel('Guest four-digit code').fill(code);await waiter.getByRole('button',{name:'Find phone code'}).click();await waiter.getByRole('button',{name:'Approve this phone'}).click();await waiter.getByText('Phone approved for Table 5.',{exact:true}).waitFor()}
  await approve(codeA);await a.bringToFront();await a.getByText('Table 5 · Phone approved',{exact:true}).waitFor({timeout:20000});assert.equal(await a.getByRole('button',{name:'Order now',exact:true}).isEnabled(),true);assert.equal(await b.getByRole('button',{name:'Order now',exact:true}).isDisabled(),true);checks.push('Waiter approves the displayed code at the matching table; only that phone unlocks')
  async function order(page,name,qty=1){await page.getByRole('button',{name:'Order now',exact:true}).click();for(let i=0;i<qty;i++)await page.locator('.customer-quantity button').filter({hasText:'+'}).click();await page.getByLabel('Name',{exact:true}).fill(name);await page.getByRole('button',{name:'Confirm order',exact:true}).click()}
  await order(a,'First phone');await a.locator('.customer-order-error').waitFor();await a.getByRole('button',{name:'Confirm order',exact:true}).click();await a.getByRole('heading',{name:'Order received'}).waitFor()
  await approve(codeB);await b.bringToFront();await b.getByText('Table 5 · Phone approved',{exact:true}).waitFor({timeout:20000});await order(b,'Second phone',2);await b.getByRole('heading',{name:'Order received'}).waitFor()
  let state=await f.runAs(h.owner,async()=>{await h.as(h.owner);return h.ownerAction('state')});const ids=state.orders.filter(o=>o.visit_id===visit.id).map(o=>o.id);assert.equal(ids.length,2);assert.equal(state.orders.reduce((n,o)=>n+Number(o.total),0),354);checks.push('Lost order response retries once without duplicates; two approved phones add orders to the same visit and bill')
  await a.goto(tableUrl);await a.getByText('Table 5 · Phone approved',{exact:true}).waitFor();const wrongTable=await a.evaluate(async({scan,dish})=>(await fetch('/api/public/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:'green-bistro',customerName:'Wrong table',idempotencyKey:crypto.randomUUID(),items:[{dishId:dish,quantity:1}],tableScan:scan})})).status,{scan:other.scan,dish:h.dish});assert.equal(wrongTable,403);checks.push('An approved cookie cannot place an order against a different table QR')
  const guestCookie=(await aContext.cookies()).find(c=>c.name.startsWith('wiit_table_')).value
  const sessionId=await f.runAs(h.owner,async()=>{await h.db.exec('reset role');const hash=require('node:crypto').createHash('sha256').update(guestCookie).digest('hex');return(await h.db.query('select id from table_guest_sessions where token_hash=$1',[hash])).rows[0].id})
  await f.runAs(h.owner,()=>f.api.tableStaff.POST(f.request(`/api/table-access?restaurant=${h.restaurant}`,{action:'revoke',data:{session_id:sessionId}})))
  await a.bringToFront();await a.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await a.getByRole('button',{name:'Order now',exact:true}).waitFor();await a.getByText('Waiter approval required',{exact:true}).waitFor({timeout:20000});assert.equal(await a.getByRole('button',{name:'Order now',exact:true}).isDisabled(),true)
  await b.goto(tableUrl);await b.getByText('Table 5 · Phone approved',{exact:true}).waitFor();offline=true;await b.getByText('Connection interrupted',{exact:true}).waitFor({timeout:20000});assert.equal(await b.getByRole('button',{name:'Order now',exact:true}).isDisabled(),true);offline=false;await b.getByText('Table 5 · Phone approved',{exact:true}).waitFor({timeout:20000});checks.push('Revocation blocks one phone; network errors lock ordering and a successful status check restores still-valid access')
  const {page:c}=await pageFor('guest');await c.goto(tableUrl);await c.locator('.table-verification-code').waitFor();const oldCode=(await c.locator('.table-verification-code').innerText()).trim()
  await f.runAs(h.owner,async()=>{await h.db.exec('reset role');await h.db.query("update table_guest_sessions set code_expires_at=now()-interval '1 second' where code=$1",[oldCode])})
  await c.getByRole('button',{name:'Request approval code',exact:true}).waitFor({timeout:20000});await c.getByRole('button',{name:'Request approval code',exact:true}).click();await c.locator('.table-verification-code').waitFor();assert.notEqual((await c.locator('.table-verification-code').innerText()).trim(),oldCode);checks.push('Expired codes stay blocked and guests can explicitly request a fresh code')
  await waiter.getByLabel('Guest four-digit code').fill('0000');for(let i=0;i<9;i++){await waiter.getByRole('button',{name:'Find phone code',exact:true}).click();await waiter.locator('[role=alert]').waitFor()}
  await waiter.getByRole('button',{name:/Try again in/}).waitFor();assert.equal(await waiter.getByRole('button',{name:/Try again in/}).isDisabled(),true);checks.push('Repeated wrong codes produce a server-enforced cooldown that the waiter screen respects')
  await f.runAs(h.owner,async()=>{await h.as(h.owner);const bill=await h.ownerAction('issue',{order_ids:ids,request_key:randomUUID()});await h.ownerAction('cash',{bill_id:bill.id,amount_paise:Number(bill.total_paise),request_key:randomUUID()});for(const ticket of (await h.ownerAction('state')).kitchen){let version=ticket.version;for(const state of ['preparing','ready','served'])await h.ownerAction('kitchen_move',{ticket_id:ticket.id,version:version++,state})};await h.ownerAction('visit_close',{visit_id:visit.id})})
  await b.bringToFront();await b.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await b.getByText('Waiter approval required',{exact:true}).waitFor({timeout:20000});assert.equal(await b.getByRole('button',{name:'Order now',exact:true}).isDisabled(),true);checks.push('Settling and closing the table automatically revokes the remaining approved phone')
  for(const [name,page]of[['owner',owner],['waiter',waiter],['guest-pending',c],['guest-revoked',b]]){await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.classList.add('dark'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' overflow');await page.screenshot({path:path.join(output,name+'-mobile-dark.png'),fullPage:true})}
  checks.push('Owner, waiter and guest verification screens fit a 390px viewport in dark mode');assert.deepEqual(errors,[]);const result={fixture:'Isolated PostgreSQL and role sessions; no real customers or external messages',checks,errors};fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
 }catch(e){for(let i=0;i<contexts.length;i++){const p=contexts[i].pages()[0];if(p){await p.screenshot({path:path.join(output,`failure-${i}.png`),fullPage:true}).catch(()=>{});console.error((await p.locator('body').innerText()).slice(-1800))}}throw e}
 finally{await browser?.close();await f.close();await h.db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
