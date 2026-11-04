// Actual React editor, public renderer, dashboard shell and CSS. Auth/API are fixtures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript')
const postcss=require('postcss'),tailwind=require('tailwindcss'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright')
const {loadServer}=require('./helpers/load-server.cjs'),{menuFixture}=require('./helpers/menu-fixture.cjs'),{draft,style,png}=require('./helpers/ai-menu-fixture.cjs')
const {BASIC_MENU_PRESETS}=loadServer('lib/ai-menu.ts')
const portionDraft=loadServer('lib/menu-ocr.ts').draftFromOcr(require('./fixtures/menu-ocr-half-full.json'))
const portionJob='9167c16c-6b93-4bc9-bc1c-455160d1d89a'
const modules=new Map(),output=path.resolve('artifacts/ai-menu-qa'),job='72ea07f6-115e-4d3c-8640-ac7aef1a0325'
function bundle(file){
  let name=path.resolve(file);if(!path.extname(name))name=['.ts','.tsx'].map(ext=>name+ext).find(f=>fs.existsSync(f))
  const id=path.relative(process.cwd(),name).replaceAll('\\','/');if(modules.has(id))return id;modules.set(id,'')
  let code=ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText
  code=code.replace(/require\("([^"]+)"\)/g,(all,n)=>n.startsWith('@/')?`require(${JSON.stringify(bundle(n.slice(2)))})`:n.startsWith('.')?`require(${JSON.stringify(bundle(path.resolve(path.dirname(name),n)))})`:all)
  modules.set(id,code);return id
}
async function main(){
  fs.mkdirSync(output,{recursive:true});const component=bundle('components/dashboard/AiMenuImporter.tsx'),shell=bundle('components/dashboard/DashboardRouteShell.tsx'),renderer=bundle('components/menu/BasicMenu.tsx')
  const runtime=`const modules={${[...modules].map(([id,code])=>`${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(',')}};const cache={};function require(id){if(id==='react')return React;if(id==='next/link')return p=>React.createElement('a',p,p.children);if(id==='next/navigation')return {usePathname:()=>location.pathname,useRouter:()=>({refresh(){window.refreshed=true}})};if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}`
  const react=fs.readFileSync(path.join(path.dirname(require.resolve('react/package.json')),'umd/react.development.js'),'utf8'),dom=fs.readFileSync(path.join(path.dirname(require.resolve('react-dom/package.json')),'umd/react-dom.development.js'),'utf8')
  const styles=['globals','employee-operations','templates','responsive','menu-modes','category-layouts','dashboard-shell','menu-design-system','menu-editor','loyalty','pos','ai-menu','menu-studio']
  const css=(await postcss([tailwind(loadServer('tailwind.config.ts').default)]).process(styles.map(s=>fs.readFileSync(`app/${s}.css`,'utf8')).join('\n'),{from:undefined})).css+'\n:root{--font-manrope:Arial;--font-poppins:Poppins;--font-playfair:Georgia}body{margin:0}'
  const menu=menuFixture(['Drinks']);menu.dishes=menu.dishes.slice(0,1);menu.restaurant.id='4be35c58-36af-4ed6-9fc5-18ca63acff44';menu.restaurant.currency='INR'
  const publicMenu=menuFixture(['Small plates','From the kitchen','Something sweet']);Object.assign(publicMenu.restaurant,{name:'Juniper & Table',currency:'INR',description:'Seasonal plates. Slow afternoons. Something worth sharing.',address:'12 Garden Lane · Open daily'})
  const names=['Burrata & garden tomatoes','Roasted pumpkin soup','Crisp zucchini ribbons','Wild mushroom tagliatelle','Wood-fired margherita','Herb-roasted chicken','Dark chocolate crémeux','Vanilla bean panna cotta','Lemon & almond cake']
  publicMenu.dishes.forEach((dish,index)=>Object.assign(dish,{name:names[index],description:['Creamy burrata, ripe tomatoes, basil oil and a little sourdough.','Roasted until golden, finished with fresh herbs and house seasoning.','A little seasonal inspiration, prepared fresh for your table.'][index%3],price:280+index*45,image_url:index<6?['/templates/green-bistro/burrata.jpg','/templates/green-bistro/pasta.jpg','/templates/green-bistro/pizza.jpg'][index%3]:undefined}))
  const extracted=draft();extracted.items.push({category:'Drinks',name:'Lemon Soda',description:'',price:null,isVeg:null,note:'Price and dietary marker are unclear.'});extracted.warnings=['Check unclear prices against the original.']
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})})
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[],checks=[],requests=[];let failPublish=true,persistedStyle=style,uploadedCoverBytes=0,portionPublished=portionDraft,persistedLogo='',logoBytes=null,logoUploads=0,failLogo=false, savedDrafts=new Map(),failDraft=false
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)))
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url()),p=url.pathname;if(url.hostname!=='menu-ai.test')return route.abort()
    const asset={'/style.css':['text/css',css],'/react.js':['text/javascript',react],'/dom.js':['text/javascript',dom],'/runtime.js':['text/javascript',runtime]}[p]
    if(asset)return route.fulfill({contentType:asset[0],body:asset[1]})
    if(p==='/api/settings/logo'){
      if(route.request().method()==='DELETE'){persistedLogo='';menu.restaurant.logo_url=undefined;publicMenu.restaurant.logo_url=undefined;return route.fulfill({json:{logoUrl:null}})}
      if(failLogo){failLogo=false;return route.fulfill({status:503,json:{error:'Logo upload temporarily unavailable.'}})}
      const form=await new Request('https://menu-ai.test/api/settings/logo',{method:'POST',headers:{'Content-Type':route.request().headers()['content-type']},body:route.request().postDataBuffer()}).formData(),logo=form.get('logo')
      assert.equal(logo.type,'image/webp');logoBytes=Buffer.from(await logo.arrayBuffer());assert.ok(logoBytes.length<50000);logoUploads++
      persistedLogo='https://menu-ai.test/test-restaurant-logo.webp';menu.restaurant.logo_url=persistedLogo;publicMenu.restaurant.logo_url=persistedLogo
      return route.fulfill({json:{logoUrl:persistedLogo}})
    }
    if(p==='/test-restaurant-logo.webp')return route.fulfill({contentType:'image/webp',body:logoBytes})
    if(p==='/api/menu/ai'){
      const mode=new URL(route.request().headers().referer||'https://menu-ai.test').searchParams.get('mode'),method=route.request().method()
      if(method==='GET')return route.fulfill({json:{style:persistedStyle,presentation:'template',ocrConfigured:true,configured:mode!=='unconfigured',job:mode==='portions'?{id:portionJob,draft:savedDrafts.get(portionJob)||portionDraft}:mode==='resume'||mode==='resume-currency'?{id:job,draft:savedDrafts.get(job)||(mode==='resume-currency'?{...extracted,currency:'USD'}:extracted)}:null}})
      if(method==='POST'){
        requests.push({method,verify:/name="verify"\r\n\r\ntrue/.test(route.request().postData())});assert.match(route.request().headers()['content-type'],/multipart\/form-data/)
        if(mode==='quota')return route.fulfill({status:429,headers:{'Retry-After':'2'},json:{error:'The AI project quota is currently exhausted.'}})
        return route.fulfill({json:{id:job,draft:mode==='currency'?{...extracted,currency:'USD'}:extracted}})
      }
      const body=route.request().postDataJSON();requests.push(body)
      if(body.action==='draft'){if(failDraft){failDraft=false;return route.fulfill({status:503,json:{error:'Temporary draft save failure.'}})}const savedAt=new Date().toISOString();savedDrafts.set(body.id,{...body.draft,_reviewedKeys:body.reviewedKeys,_style:body.style,_useBasic:body.useBasic,_savedAt:savedAt});return route.fulfill({json:{saved:true,savedAt}})}
      if(body.action==='publish'&&failPublish){failPublish=false;return route.fulfill({status:503,json:{error:'Temporary save failure. Try again.'}})}
      if(body.action==='style')persistedStyle=body.style
      if(body.action==='publish'&&body.id===portionJob)portionPublished=body.draft
      return route.fulfill({json:body.action==='publish'?{imported:body.draft.items.length}:{saved:true}})
    }
    if(p==='/api/settings/template-image'){
      uploadedCoverBytes=route.request().postDataBuffer().length;assert.match(route.request().postData(),/image\/webp/)
      return route.fulfill({json:{imageUrl:'https://menu-ai.test/templates/green-bistro/cover-food.jpg'}})
    }
    if(p.startsWith('/templates/')){const file=path.resolve('public','.'+p);return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''})}
    if(p.startsWith('/assets/')){const file=path.resolve('public','.'+p);return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''})}
    if(p==='/menu/studio-test'){
      const preset=BASIC_MENU_PRESETS.find(preset=>preset.id===url.searchParams.get('preset'))
      const design=preset?{...preset.style,heroImage:'/templates/green-bistro/cover-food.jpg',motion:'gentle'}:persistedStyle
      const categories=[...new Set(portionPublished.items.map(i=>i.category))].map((name,index)=>({id:`pc-${index}`,restaurant_id:menu.restaurant.id,name,sort_order:index}))
      const portionMenu={...menu,categories,dishes:portionPublished.items.map((item,index)=>({id:`po-${index}`,restaurant_id:menu.restaurant.id,name:item.name,description:item.description,category_id:categories.find(c=>c.name===item.category).id,price:item.price,is_veg:item.isVeg,is_available:true,sort_order:index,created_at:''}))}
      const shownMenu=url.searchParams.get('mode')==='portions'?portionMenu:publicMenu
      return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/react.js"></script><script src="/dom.js"></script><script src="/runtime.js"></script><script>ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(require(${JSON.stringify(renderer)}).default,{data:${JSON.stringify(shownMenu)},style:${JSON.stringify(design)}}))</script></body></html>`})
    }
    return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/react.js"></script><script src="/dom.js"></script><script src="/runtime.js"></script><script>ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(require(${JSON.stringify(shell)}).default,null,React.createElement(require(${JSON.stringify(component)}).default,{menu:${JSON.stringify(menu)}})))</script></body></html>`})
  })
  const page=await context.newPage()
  const go=async mode=>{await page.evaluate(()=>localStorage.clear()).catch(()=>{});await page.goto(`https://menu-ai.test/dashboard/ai-menu${mode?`?mode=${mode}`:''}`);await page.locator('.studio-title h1').waitFor()}
  const openDesign=async()=>page.getByRole('button',{name:'Design',exact:true}).click()
  const closeDesign=async()=>page.getByRole('button',{name:'Close design settings'}).click()
  const publishStep=async()=>page.locator('.studio-steps button').last().click()
  const byName=name=>page.locator('.studio-row').filter({has:page.locator(`input[aria-label="Dish name"][value=${JSON.stringify(name)}]`)})
  try{
    await page.setContent('<main style="width:560px;padding:36px;background:white;color:black;font:24px Arial;line-height:1.8"><h1>TEST CAFE</h1><h2>Drinks</h2><p>Lassi INR 90 VEG<br>Lemon Soda INR 60 VEG</p></main>')
    await page.locator('main').screenshot({path:path.join(output,'synthetic-menu.png')})
    await go('unconfigured');await page.getByLabel('Text reader').selectOption('online');await page.getByText('An administrator needs',{exact:false}).waitFor();assert.ok(await page.getByRole('button',{name:'Scan menu photos'}).isDisabled())
    assert.equal(await page.getByRole('button',{name:'Save draft',exact:true}).isDisabled(),true)
    await openDesign();await page.getByLabel('Live menu appearance').selectOption('basic');await page.getByRole('button',{name:'Save menu appearance'}).click();await page.getByText('Menu appearance saved.').waitFor();await closeDesign()
    checks.push('Upload setup and design drawer work independently; no draft or unconfigured online scan can be submitted')

    const logoBuffer=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1600;c.height=800;const ctx=c.getContext('2d');ctx.fillStyle='#285443';ctx.fillRect(400,200,800,400);return c.toDataURL('image/png').split(',')[1]}),'base64')
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Add restaurant logo',exact:true}).click();await (await chooser).setFiles({name:'transparent-logo.png',mimeType:'image/png',buffer:logoBuffer});await page.getByRole('status').filter({hasText:'Logo saved to your menu.'}).waitFor()
    const logo=page.locator('.basic-menu-wordmark img');await logo.evaluate(img=>img.decode())
    assert.deepEqual(await logo.evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight,fit:getComputedStyle(img).objectFit})),{width:512,height:256,fit:'contain'})
    await closeDesign();await page.reload();await page.getByRole('button',{name:'Change restaurant logo',exact:true}).waitFor();await openDesign()
    await page.getByLabel('Upload restaurant logo',{exact:true}).setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await page.getByRole('alert').filter({hasText:'logo under 2 MB'}).waitFor();assert.equal(logoUploads,1)
    failLogo=true;await page.getByLabel('Upload restaurant logo',{exact:true}).setInputFiles({name:'again.png',mimeType:'image/png',buffer:logoBuffer});await page.getByRole('alert').filter({hasText:'Logo upload temporarily unavailable'}).waitFor();assert.equal(await logo.getAttribute('src'),persistedLogo)
    await page.getByRole('button',{name:'Remove logo',exact:true}).click();await page.getByRole('status').filter({hasText:'Logo removed.'}).waitFor();await closeDesign()
    checks.push('Menu star opens the logo picker and drawer; resized logo survives reload, failed upload preserves it, removal restores the star')

    await go();await page.getByLabel('Text reader').selectOption('online');await page.getByLabel('Compare two AI readings').check();await page.getByLabel('Menu photos',{exact:true}).setInputFiles(path.join(output,'synthetic-menu.png'));await page.getByRole('button',{name:'Scan menu photos'}).click()
    await page.getByRole('heading',{name:'Menu items 2 dishes'}).waitFor();assert.equal(requests.find(r=>r.method==='POST').verify,true);assert.equal(await page.locator('.basic-menu-price-unconfirmed').innerText(),'Confirm price')
    await page.getByRole('button',{name:'Review next item'}).click();assert.match(await page.locator('.studio-progress').innerText(),/1 of 2 reviewed/)
    await page.getByRole('button',{name:'Confirm item',exact:true}).click();await page.getByRole('alert').filter({hasText:'confirm the dietary label'}).waitFor()
    await publishStep();await page.getByLabel('I checked every dish',{exact:false}).check();await page.getByRole('button',{name:'Publish reviewed dishes'}).click();await page.getByRole('alert').filter({hasText:'confirm its price'}).waitFor();assert.equal(requests.filter(r=>r.action==='publish').length,0)
    await page.getByRole('button',{name:'Back to review'}).click();await page.getByLabel('Single price for Lemon Soda',{exact:true}).fill('60');await page.getByLabel('Dietary label',{exact:true}).selectOption('veg');await page.getByRole('button',{name:'Confirm item',exact:true}).click()
    assert.match(await page.locator('.studio-progress').innerText(),/2 of 2 reviewed/);await page.getByLabel('Single price for Lemon Soda',{exact:true}).fill('65');assert.match(await page.locator('.studio-progress').innerText(),/1 of 2 reviewed/)
    await page.getByRole('button',{name:'Confirm item',exact:true}).click();await page.getByLabel('Filter items').selectOption('reviewed');assert.equal(await page.locator('.studio-row').count(),2);await page.getByLabel('Filter items').selectOption('pending');await page.getByRole('heading',{name:'No dishes found'}).waitFor();await page.getByLabel('Filter items').selectOption('all');await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('status').filter({hasText:'Draft saved.'}).waitFor();assert.match(await page.locator('.studio-save-status').innerText(),/Draft saved/)
    await page.evaluate(()=>localStorage.clear());await page.goto('https://menu-ai.test/dashboard/ai-menu?mode=resume');await page.getByLabel('Single price for Lemon Soda',{exact:true}).waitFor();assert.equal(await page.getByLabel('Single price for Lemon Soda',{exact:true}).inputValue(),'65');assert.match(await page.locator('.studio-progress').innerText(),/2 of 2 reviewed/)
    failDraft=true;await page.getByLabel('Single price for Lemon Soda',{exact:true}).fill('60');await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('alert').filter({hasText:'Temporary draft save failure.'}).waitFor();assert.match(await page.locator('.studio-save-status').innerText(),/Unsaved/)
    await page.reload();await page.getByLabel('Single price for Lemon Soda',{exact:true}).waitFor();assert.equal(await page.getByLabel('Single price for Lemon Soda',{exact:true}).inputValue(),'60')
    await publishStep();await page.getByLabel('I checked every dish',{exact:false}).check();await page.getByRole('button',{name:'Publish reviewed dishes'}).click();await page.getByRole('alert').filter({hasText:'Temporary save failure'}).waitFor();await page.getByRole('button',{name:'Publish reviewed dishes'}).click();await page.getByRole('status').filter({hasText:'Published 2 dishes'}).waitFor()
    checks.push('Review progress requires real confirmation, edits invalidate it, incomplete fields block publishing, private saves restore without browser storage, failed saves retain local edits and publish retries retain the same job')

    await go('quota');await page.getByLabel('Text reader').selectOption('online');await page.getByLabel('Menu photos',{exact:true}).setInputFiles(path.join(output,'synthetic-menu.png'));await page.getByRole('button',{name:'Scan menu photos'}).click();await page.getByRole('alert').filter({hasText:'quota'}).waitFor();assert.ok(await page.getByRole('button',{name:/Try again in/}).isDisabled());await page.getByRole('button',{name:'Scan menu photos'}).waitFor({timeout:5000})
    checks.push('Scan quota cooldown prevents repeated requests')

    savedDrafts.delete(job);await go('resume-currency');await page.getByLabel('Menu currency').waitFor();assert.equal(await page.getByLabel('Menu currency').inputValue(),'USD');await page.getByLabel('Menu currency').selectOption('INR');assert.equal(await page.getByLabel('Single price for Lassi',{exact:true}).inputValue(),'90');assert.match(await page.locator('.studio-currency-warning').innerText(),/does not convert/)
    await go('portions');await page.getByRole('heading',{name:'Menu items 24 dishes'}).waitFor();const scansBefore=requests.filter(r=>r.method==='POST').length
    await page.getByRole('button',{name:/1 price needs review Review flagged/}).click();assert.equal(await page.locator('.studio-row').count(),1);await page.getByLabel('Filter items').selectOption('all')
    assert.equal(await page.locator('.studio-row').count(),6);await page.getByRole('button',{name:'Next page',exact:true}).click();assert.equal(await page.locator('.studio-page-number').innerText(),'2')
    await page.getByLabel('Search dishes').fill('Chicken Tikka');assert.ok(await page.locator('.studio-row').count()>=1);await page.getByLabel('Search dishes').fill('zznomatch');await page.getByRole('heading',{name:'No dishes found'}).waitFor();await page.getByRole('button',{name:'Show all dishes'}).click()
    await page.getByLabel('Items per page').selectOption('100');assert.equal(await page.locator('.studio-row').count(),24)
    const tikka=byName('Chicken Tikka (8 pcs)');await tikka.getByRole('button',{name:'Edit Chicken Tikka (8 pcs)',exact:true}).click();assert.equal(await tikka.getByLabel('Half price for Chicken Tikka (8 pcs)',{exact:true}).inputValue(),'140');assert.equal(await tikka.getByLabel('Full price for Chicken Tikka (8 pcs)',{exact:true}).inputValue(),'230')
    await tikka.getByLabel('Half price for Chicken Tikka (8 pcs)',{exact:true}).fill('145');await tikka.getByLabel('Full price for Chicken Tikka (8 pcs)',{exact:true}).fill('235');assert.match(await page.locator('.basic-menu-dish.is-editing').innerText(),/145/);assert.match(await page.locator('.basic-menu-dish.is-editing').innerText(),/235/)
    await tikka.getByLabel('Half price for Chicken Tikka (8 pcs)',{exact:true}).fill('140');await tikka.getByLabel('Full price for Chicken Tikka (8 pcs)',{exact:true}).fill('230')
    await tikka.getByRole('button',{name:'View in original photo'}).click();await page.getByLabel('Choose original photos').setInputFiles('C:/Users/Saksham/Downloads/images (1).jpg');await page.locator('.ai-review-source-box').waitFor();assert.equal(requests.filter(r=>r.method==='POST').length,scansBefore)
    await page.getByRole('button',{name:'Live menu',exact:true}).click();await page.getByRole('button',{name:'Preview full screen'}).click();await page.getByRole('dialog',{name:'Full screen menu preview'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'Full screen menu preview'}).count(),0)
    await page.getByRole('button',{name:'Expand preview',exact:true}).click();await page.getByRole('button',{name:'Close full screen preview'}).click()
    checks.push('24 dishes retain all 32 Half/Full options; search, filters, pagination, synchronized preview, source highlighting and both full-screen buttons work without scanning')

    await openDesign();await page.getByRole('button',{name:'Garden Fresh & botanical'}).click();await page.getByRole('button',{name:'At the table',exact:true}).click();await page.getByLabel('Font',{exact:true}).selectOption('poppins');await closeDesign()
    await page.getByRole('button',{name:/TANDOORI SNACKS/}).click();await page.getByLabel('Items per page').selectOption('6');if(await byName('Chicken Tikka (8 pcs)').locator('.studio-row-toggle').getAttribute('aria-expanded')!=='true')await byName('Chicken Tikka (8 pcs)').locator('.studio-row-toggle').click()
    await page.setViewportSize({width:1586,height:992});await page.screenshot({path:path.join(output,'studio-desktop.png'),fullPage:false})
    for(const width of [320,390,768,1180,1440]){
      await page.setViewportSize({width,height:950});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`workspace overflow at ${width}`)
      if(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1))console.log('Scroll diagnostics',await page.evaluate(()=>({height:innerHeight,scroll:document.documentElement.scrollHeight,body:{height:document.body.offsetHeight,min:getComputedStyle(document.body).minHeight},roots:['html','body','#root','.menu-studio-shell','.studio-shell-main','.menu-studio','.studio-workbench','.studio-editor','.studio-table-area'].map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),c=getComputedStyle(e);return [s,r.top,r.bottom,c.overflow,c.position,e.scrollHeight,e.scrollTop]}),overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().bottom>innerHeight+1&&getComputedStyle(e).display!=='none').slice(0,8).map(e=>({tag:e.tagName,class:e.className,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,height:getComputedStyle(e).height,minHeight:getComputedStyle(e).minHeight,position:getComputedStyle(e).position}))})))
      assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1),false,`outer scroll at ${width}`)
      assert.equal(await page.locator('.studio-row').evaluateAll(nodes=>nodes.some(n=>n.scrollWidth>n.clientWidth+1)),false,`row overflow at ${width}`)
      if(width<=1000){await page.getByRole('button',{name:'Preview',exact:true}).click();await page.getByRole('button',{name:'Expand preview',exact:true}).click();await page.keyboard.press('Escape');await page.getByRole('button',{name:'Edit menu',exact:true}).click()}
      if(width===390)await page.screenshot({path:path.join(output,'studio-phone.png'),fullPage:false})
    }
    await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.documentElement.classList.add('dark'));assert.equal(await page.locator('.studio-row input').first().evaluate(e=>getComputedStyle(e).color),'rgb(17, 29, 53)');assert.equal(await page.locator('.studio-row input').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');await page.evaluate(()=>document.documentElement.classList.remove('dark'));await page.getByLabel('Preview size').selectOption('phone')
    const canvas=page.locator('.ai-menu-preview-canvas'),nav=page.locator('.basic-menu-category-nav');await canvas.evaluate(e=>e.scrollTop=900);const before=await nav.boundingBox();await canvas.evaluate(e=>e.scrollTop+=160);const after=await nav.boundingBox();assert.ok(Math.abs(before.y-after.y)<=1,'Category navigation must stay sticky')
    await openDesign();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'Menu design',exact:true}).isVisible(),false)
    checks.push('Workspace fits 320–1440px without outer scrolling or clipped rows; mobile edit/preview, responsive full screen, design Escape and sticky customer categories work')

    await page.getByRole('button',{name:'All 24',exact:true}).click();await page.getByLabel('Items per page').selectOption('100')
    const paneer=byName('Paneer Tikka');await paneer.getByLabel('Half price for Paneer Tikka',{exact:true}).fill('100');await paneer.getByRole('button',{name:'Actions for Paneer Tikka',exact:true}).click();await paneer.getByRole('button',{name:'Remove Half price',exact:true}).click();assert.equal(await paneer.getByLabel('Full price for Paneer Tikka',{exact:true}).inputValue(),'180');assert.equal(await paneer.getByLabel('Half price for Paneer Tikka',{exact:true}).inputValue(),'')
    await page.getByRole('button',{name:'Add item',exact:true}).click();const manual=byName('');await manual.getByLabel('Dish name',{exact:true}).fill('Chef special');const special=byName('Chef special');await special.getByLabel('Single price for Chef special',{exact:true}).fill('90');await special.getByRole('button',{name:'Actions for Chef special',exact:true}).click();await special.getByRole('button',{name:'Add Half / Full prices',exact:true}).click();await special.getByLabel('Half price for Chef special',{exact:true}).fill('45');assert.equal(await special.getByLabel('Full price for Chef special',{exact:true}).inputValue(),'90');await special.getByRole('button',{name:'Actions for Chef special',exact:true}).click();await special.getByRole('button',{name:'Remove dish',exact:true}).click()
    await page.getByRole('button',{name:'Manage categories',exact:true}).click();await page.getByLabel('Add category',{exact:true}).fill('Chef specials');await page.getByRole('button',{name:'Add with first dish',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Chef specials 1',exact:true}).count(),1);await byName('').getByRole('button',{name:'Actions for new dish',exact:true}).click();await page.getByRole('button',{name:'Remove dish',exact:true}).click();await page.getByRole('button',{name:'All 24',exact:true}).click()
    await page.getByLabel('Menu currency',{exact:true}).selectOption('INR');await byName('Veg Manchow').getByLabel('Full price for Veg Manchow',{exact:true}).fill('80')
    for(const row of await page.locator('.studio-row').all()){const name=await row.getByLabel('Dish name',{exact:true}).inputValue();if(await row.locator('.studio-row-toggle').getAttribute('aria-expanded')!=='true')await row.locator('.studio-row-toggle').click();await row.getByLabel('Dietary label',{exact:true}).selectOption(/chicken|murg/i.test(name)?'nonveg':'veg')}
    await publishStep();await page.getByLabel('I checked every dish',{exact:false}).check();await page.getByRole('button',{name:'Publish reviewed dishes'}).click();await page.getByRole('status').filter({hasText:'Published 24 dishes with 32 price options'}).waitFor()
    assert.equal(requests.filter(r=>r.method==='POST').length,scansBefore);assert.equal(portionPublished.items.length,32)
    checks.push('Dish and portion additions/removals, category management, explicit dietary confirmation and publishing preserve the 24-dish / 32-price menu')
    for(const preset of BASIC_MENU_PRESETS)for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:1000});await page.goto(`https://menu-ai.test/menu/studio-test?mode=portions&preset=${preset.id}`);await page.locator('.basic-menu-dish').first().waitFor();assert.equal(await page.locator('.basic-menu-dish').count(),24)
      const dish=page.locator('.basic-menu-dish').filter({has:page.getByRole('heading',{name:'Chicken Tikka (8 pcs)',exact:true})});assert.match(await dish.locator('[data-portion="Half"] strong').innerText(),/140/);assert.match(await dish.locator('[data-portion="Full"] strong').innerText(),/230/)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`public overflow ${preset.id} ${width}`);assert.equal(await page.getByRole('button',{name:'Change restaurant logo',exact:true}).count(),0)
    }
    checks.push('All five public looks preserve both prices at four widths and expose no editor controls')
    assert.deepEqual(errors,[]);const report={passed:checks.length,checks,pageErrors:errors};fs.writeFileSync(path.join(output,'studio-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
  }catch(error){await page.screenshot({path:path.join(output,'studio-failure.png'),fullPage:true});throw error}finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
