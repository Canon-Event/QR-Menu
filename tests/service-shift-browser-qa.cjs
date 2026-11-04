// One synthetic restaurant, actual React components/API handlers/PostgreSQL,
// separate authenticated role fixtures, and an HTTP payment-provider fixture.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),{randomUUID}=require('node:crypto')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),postcss=require('postcss'),tailwind=require('tailwindcss')
const {posDatabase}=require('./helpers/pos-database.cjs'),{paymentFixture}=require('./helpers/payment-fixture.cjs'),{loadTypeScript}=require('./helpers/load-typescript.cjs')
const output=path.resolve('artifacts/service-shift-qa'),modules=new Map()
function bundle(file){let filename=path.resolve(file);if(!path.extname(filename))filename=['.ts','.tsx'].map(e=>filename+e).find(f=>fs.existsSync(f));const id=path.relative(process.cwd(),filename).replaceAll('\\','/');if(modules.has(id))return id;modules.set(id,'');let code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;code=code.replace(/require\("([^"]+)"\)/g,(all,name)=>name.startsWith('@/')?`require(${JSON.stringify(bundle(name.slice(2)))})`:name.startsWith('.')?`require(${JSON.stringify(bundle(path.resolve(path.dirname(filename),name)))})`:all);modules.set(id,code);return id}
async function main(){
  fs.mkdirSync(output,{recursive:true});const h=await posDatabase(),f=await paymentFixture(h),checks=[],errors=[],contexts=[]
  let browser
  try{
    const roles=Object.fromEntries(['waiter','kitchen','cashier','manager'].map(r=>[r,randomUUID()]))
    await h.db.exec('reset role');await h.db.query("update restaurants set name='Service shift test restaurant',menu_mode='ordering' where id=$1",[h.restaurant])
    for(const [role,id] of Object.entries(roles))await h.db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${role}@shift.test`])
    await h.as(h.owner);await h.ownerAction('settings',{...h.settings,legal_name:'Service shift test restaurant'})
    for(const role of Object.keys(roles)){const r=await f.api.team.POST(f.request('/api/team',{action:'grant',data:{name:role,email:`${role}@shift.test`,role}}));assert.equal(r.status,200)}
    await h.as(h.owner);await h.ownerAction('table_create',{name:'Table 1',seats:4})
    const staffId=bundle('components/staff/StaffWorkspace.tsx'),guestId=bundle('components/billing/CustomerBill.tsx')
    const runtime=`const modules={${[...modules].map(([id,code])=>`${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(',')}};const cache={};function require(id){if(id==='react')return React;if(id==='qrcode')return {toDataURL:window.makeBillQr};if(id==='next/link')return p=>React.createElement('a',p,p.children);if(id==='next/script')return function Script(p){React.useEffect(()=>{p.onReady?.()},[]);return null};if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}`
    const css=(await postcss([tailwind(loadTypeScript('tailwind.config.ts').default)]).process(['globals','responsive','dashboard-shell','pos'].map(n=>fs.readFileSync(`app/${n}.css`,'utf8')).join('\n'),{from:undefined})).css+'\nbody{margin:0}:root{--font-manrope:Arial;--font-dm-serif:Georgia}'
    const react=fs.readFileSync(path.join(path.dirname(require.resolve('react/package.json')),'umd/react.development.js'),'utf8'),dom=fs.readFileSync(path.join(path.dirname(require.resolve('react-dom/package.json')),'umd/react-dom.development.js'),'utf8')
    browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})})
    let lostSubmit=true,failOrders=false
    async function pageFor(role){
      const actor=roles[role]||null,context=await browser.newContext({viewport:{width:1280,height:1000}});contexts.push(context)
      await context.exposeFunction('makeBillQr',url=>require('qrcode').toDataURL(url,{width:180,margin:1}))
      await context.exposeFunction('completeFixturePayment',orderId=>{const p=f.payment(orderId);return {razorpay_payment_id:p.id,razorpay_signature:p.signature}})
      await context.addInitScript(()=>{window.Razorpay=class{constructor(options){this.options=options}on(){}async open(){const p=await window.completeFixturePayment(this.options.order_id);await this.options.handler(p)}}})
      context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)))
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url()),p=url.pathname
        if(url.hostname!=='shift.test')return route.abort()
        const asset={'/style.css':['text/css',css],'/react.js':['text/javascript',react],'/dom.js':['text/javascript',dom],'/runtime.js':['text/javascript',runtime]}[p]
        if(asset)return route.fulfill({contentType:asset[0],body:asset[1]})
        return f.runAs(actor,async()=>{
          const method=route.request().method(),body=['GET','HEAD'].includes(method)?undefined:route.request().postDataJSON()
          const request=f.request(p+url.search,body,method)
          let response
          if(p==='/api/table-access')response=await f.api.tableStaff[method](request)
          else if(p==='/api/staff')response=await f.api.staff[method](request)
          else if(p==='/api/staff/orders'){
            if(failOrders&&method==='GET'){failOrders=false;return route.fulfill({status:503,json:{error:'Temporary network outage; current orders are still shown.'}})}
            response=await f.api.staffOrders[method](request)
          }else if(p==='/api/staff/billing')response=await f.api.staffBilling[method](request)
          else if(p==='/api/public/billing/checkout')response=await f.api.checkout.POST(request)
          else if(p==='/api/public/billing/verify')response=await f.api.verify.POST(request)
          else if(p.startsWith('/api/public/billing/'))response=await f.api.publicBill.GET(request,{params:Promise.resolve({token:p.split('/').at(-1)})})
          if(response){
            if(p==='/api/staff'&&method==='POST'&&lostSubmit&&response.ok){lostSubmit=false;return route.abort('failed')}
            return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()})
          }
          let render
          if(p.startsWith('/bill/')){
            const response=await f.api.publicBill.GET(request,{params:Promise.resolve({token:p.split('/').at(-1)})}),value=await response.json()
            render=`React.createElement(require(${JSON.stringify(guestId)}).default,${JSON.stringify({token:p.split('/').at(-1),initialBill:value.bill,gatewayReady:true})})`
          }else{
            const {data,error}=await f.rpc('team_workspace',{p_restaurant_id:h.restaurant});if(error)throw new Error(error.message)
            render=`React.createElement(require(${JSON.stringify(staffId)}).default,${JSON.stringify({initial:data})})`
          }
          return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/react.js"></script><script src="/dom.js"></script><script src="/runtime.js"></script><script>ReactDOM.createRoot(document.getElementById('root')).render(${render})</script></body></html>`})
        })
      })
      const page=await context.newPage();if(role!=='guest')await page.goto(`https://shift.test/staff/${h.restaurant}`);return page
    }
    const waiter=await pageFor('waiter');await waiter.getByRole('heading',{name:'Take an order'}).waitFor()
    assert.equal(await waiter.getByRole('button',{name:'Billing',exact:true}).count(),0)
    await waiter.getByRole('button',{name:'Tables',exact:true}).click();await waiter.getByLabel('Guest name for a new visit').fill('Dinner guests');await waiter.getByRole('button',{name:'Seat guests'}).click();await waiter.getByText('Occupied',{exact:true}).waitFor()
    await waiter.getByRole('button',{name:'Orders',exact:true}).click();await waiter.getByLabel('Guest name',{exact:true}).fill('Table guests');await waiter.getByLabel('Table visit').selectOption({label:'Table 1 · Dinner guests'});await waiter.getByLabel('Dish').selectOption(h.dish);await waiter.getByLabel('Quantity',{exact:true}).fill('2');await waiter.getByRole('button',{name:'Add item',exact:true}).click();await waiter.getByLabel('Kitchen note').fill('No sugar')
    await waiter.getByRole('button',{name:'Send order',exact:true}).click();await waiter.locator('.pos-alert').waitFor();await waiter.getByRole('button',{name:'Send order',exact:true}).click();await waiter.getByText(/Order #\d+ sent/).waitFor()
    let state=await f.runAs(h.owner,async()=>{await h.as(h.owner);return h.ownerAction('state')});assert.equal(state.orders.length,1);const staffOrder=state.orders[0]
    checks.push('Waiter seats a table and retries a committed order after a lost response; one order and one kitchen ticket exist')
    await waiter.getByRole('heading',{name:'Table guests',exact:true}).waitFor({timeout:12000});
    const publicBody={slug:'green-bistro',idempotencyKey:randomUUID(),customerName:'QR guest',phone:'9999999999',note:'Phone order',items:[{dishId:h.dish,quantity:1}]}
    const submitted=await f.runAs(null,()=>f.api.publicOrders.POST(f.request('/api/public/orders',publicBody)));assert.equal(submitted.status,201)
    const replayed=await f.runAs(null,()=>f.api.publicOrders.POST(f.request('/api/public/orders',publicBody)));assert.equal(replayed.status,200)
    await waiter.getByRole('heading',{name:'QR guest',exact:true}).waitFor({timeout:12000});await waiter.getByText('Updates every 5 seconds · 2 active orders').waitFor()
    failOrders=true;await waiter.getByRole('button',{name:'Refresh orders'}).click();await waiter.getByText(/Temporary network outage/).waitFor();assert.equal(await waiter.getByRole('heading',{name:'QR guest',exact:true}).count(),1);await waiter.getByRole('button',{name:'Refresh orders'}).click();await waiter.getByText(/Temporary network outage/).waitFor({state:'hidden'})
    state=await f.runAs(h.owner,async()=>{await h.as(h.owner);return h.ownerAction('state')});const qrOrder=state.orders.find(o=>o.customer_name==='QR guest')
    await waiter.getByRole('button',{name:'Tables',exact:true}).click();await waiter.getByLabel('Add an order').selectOption(qrOrder.id)
    await waiter.getByText('2 orders · Since',{exact:false}).waitFor()
    checks.push('Phone order retry is deduplicated; polling updates all-active counts and recovers from outages. Shared alerts are covered by notifications-browser-qa.')
    const kitchen=await pageFor('kitchen');await kitchen.getByRole('button',{name:'Start preparing'}).first().waitFor();assert.equal(await kitchen.getByRole('button',{name:'Orders',exact:true}).count(),0);assert.equal((await kitchen.locator('body').innerText()).includes('9999999999'),false)
    for(let i=0;i<2;i++){await kitchen.getByRole('button',{name:'Start preparing'}).first().click();await kitchen.getByRole('button',{name:'Mark ready',exact:true}).first().click();await kitchen.getByRole('button',{name:'Mark served',exact:true}).first().click()}
    await kitchen.screenshot({path:path.join(output,'kitchen.png'),fullPage:true});checks.push('Kitchen account prepares, marks ready and serves both tickets without customer contact or financial access')
    await waiter.getByRole('button',{name:'Orders',exact:true}).click()
    for(const o of [staffOrder,qrOrder])for(const status of ['confirmed','preparing','ready','completed']){
      await waiter.getByLabel(`Status for order ${o.order_number}`,{exact:true}).selectOption(status)
      await waiter.waitForFunction(({number,status})=>{const el=document.querySelector(`select[aria-label="Status for order ${number}"]`);return status==='completed'?!el:el?.value===status&&!el.disabled},{number:o.order_number,status})
    }
    await waiter.getByRole('button',{name:'Completed & cancelled',exact:true}).click()
    for(const o of [staffOrder,qrOrder]){const select=waiter.getByLabel(`Status for order ${o.order_number}`,{exact:true});await select.waitFor();assert.equal(await select.inputValue(),'completed');assert.equal(await select.isDisabled(),true)}
    checks.push('Waiter advances both orders through valid service statuses to completed; each change is versioned and audited')
    await waiter.getByRole('button',{name:'Tables',exact:true}).click()
    const cashier=await pageFor('cashier');await cashier.getByRole('button',{name:'Billing',exact:true}).click();await cashier.getByRole('navigation',{name:'Billing sections'}).getByRole('button',{name:'Tables',exact:true}).click();await cashier.getByRole('button',{name:'Build table bill'}).click();await cashier.getByRole('button',{name:'Preview total'}).click();await cashier.getByText('Calculated total').waitFor();await cashier.getByRole('button',{name:'Issue invoice'}).click();await cashier.getByRole('heading',{name:'Payment record'}).waitFor()
    await cashier.getByLabel('Cash applied to bill').fill('100');await cashier.getByRole('button',{name:'Record cash',exact:true}).click();await cashier.locator('.pos-ledger-row').filter({hasText:'Cash'}).waitFor();assert.equal(await cashier.getByRole('button',{name:'Request refund'}).count(),0)
    state=await f.runAs(h.owner,async()=>{await h.as(h.owner);return h.ownerAction('state')});const bill=state.bills[0];assert.equal(Number(bill.total_paise),35400);assert.equal(Number(bill.balance_paise),25400)
    const guest=await pageFor('guest');await guest.goto(`https://shift.test/bill/${bill.public_token}`);await guest.getByRole('button',{name:/Pay .* online/}).click();await guest.getByText('Payment received. Thank you.').waitFor();await guest.getByText('Paid',{exact:true}).waitFor()
    await cashier.locator('.pos-ledger-row').filter({hasText:'Online · verified'}).waitFor({timeout:15000});await cashier.getByRole('heading',{name:'Record cash received'}).waitFor({state:'hidden',timeout:15000})
    checks.push('Cashier combines both table orders into one ₹354 invoice, receives ₹100 cash and customer pays ₹254 through signed, server-verified checkout; cashier refreshes automatically')
    const denied=await cashier.evaluate(async({rid,payment})=>{const r=await fetch(`/api/staff/billing?restaurant=${rid}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'refund',data:{payment_id:payment,amount_paise:100,request_key:crypto.randomUUID(),reason:'Forbidden refund'}})});return r.status},{rid:h.restaurant,payment:bill.payments[0].id});assert.equal(denied,403)
    const manager=await pageFor('manager');await manager.getByRole('button',{name:'Billing',exact:true}).click();await manager.getByRole('button').filter({hasText:bill.invoice_number}).click();await manager.getByLabel('Original payment').selectOption({label:'razorpay · ₹254.00'});await manager.getByLabel('Refund amount').fill('18');await manager.getByLabel('Reason',{exact:true}).fill('Returned item');await manager.getByRole('button',{name:'Request refund'}).click();await manager.getByText(/Credit note C\//).waitFor()
    await manager.getByRole('button',{name:'Daily close',exact:true}).click();await manager.getByLabel('Opening cash').fill('500');await manager.getByLabel('Counted cash').fill('600');await manager.getByRole('button',{name:'Save cash closing'}).click();await manager.getByRole('heading',{name:'Cash closing recorded'}).waitFor()
    const financials=await f.runAs(roles.manager,async()=>{const {data,error}=await f.rpc('restaurant_financial_report',{p_restaurant_id:h.restaurant});assert.equal(error,null);return data})
    assert.equal(Number(financials.collected_paise),35400);assert.equal(Number(financials.refunded_paise),1800);assert.equal(Number(financials.net_collected_paise),33600);assert.equal(Number(financials.net_invoiced_paise),33600);assert.equal(Number(financials.outstanding_paise),0);assert.equal(Number(financials.overpaid_paise),0)
    const closing=await f.runAs(roles.manager,async()=>{await h.as(roles.manager);return h.ownerAction('state')})
    assert.equal(Number(closing.report.closing.expected_paise),60000);assert.equal(Number(closing.report.closing.counted_paise),60000)
    const events=await f.runAs(h.owner,async()=>{await h.as(h.owner);return h.db.query('select * from order_events where restaurant_id=$1',[h.restaurant])});assert.equal(events.rows.length,8)
    await waiter.getByRole('button',{name:'Close visit'}).click();await waiter.getByText('Available',{exact:true}).waitFor()
    checks.push('Cashier refund is rejected; manager refunds ₹18 online once, creates a credit note and closes ₹600 cash including ₹500 opening; net receipts and sales both equal ₹336')
    for(const [role,page] of [['waiter',waiter],['cashier',cashier],['manager',manager],['kitchen',kitchen],['guest',guest]]){await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.classList.add('dark'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${role} mobile overflow`);await page.screenshot({path:path.join(output,`${role}-mobile-dark.png`),fullPage:true})}
    const revoked=await f.runAs(h.owner,()=>f.api.team.POST(f.request('/api/team',{action:'revoke',data:{user_id:roles.waiter}})));assert.equal(revoked.status,200)
    const status=await waiter.evaluate(async rid=>(await fetch(`/api/staff?restaurant=${rid}`)).status,h.restaurant);assert.equal(status,403)
    checks.push('Role workspaces and customer receipt fit 390px dark mode; owner revocation blocks an already signed-in waiter immediately')
    assert.deepEqual(errors,[]);const report={fixture:'Isolated synthetic restaurant; no real payments',checks,financials,errors};fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
  }catch(error){for(let i=0;i<contexts.length;i++){const page=contexts[i].pages()[0];if(page){await page.screenshot({path:path.join(output,`failure-${i}.png`),fullPage:true}).catch(()=>{});console.error((await page.locator('body').innerText()).slice(-2200))}}throw error}
  finally{await browser?.close();await f.close();await h.db.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})


