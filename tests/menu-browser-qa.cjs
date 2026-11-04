/* Run with PLAYWRIGHT_MODULE and CHROMIUM_PATH when Playwright is installed outside this repo.
   Exercises real React components/CSS against a fixture HTTP service, not a production database. */
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')
const postcss = require('postcss')
const tailwind = require('tailwindcss')
const { menuFixture } = require('./helpers/menu-fixture.cjs')
const { settingsFixture } = require('./helpers/settings-fixture.cjs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output = path.resolve(process.env.MENU_QA_OUTPUT || 'artifacts/menu-qa')
let debugPage
fs.mkdirSync(output, {recursive:true})

const modules = new Map()
function bundle(file) {
  let filename=path.resolve(file)
  if(!path.extname(filename)) filename=['.ts','.tsx'].map(ext=>filename+ext).find(f=>fs.existsSync(f))
  const id=path.relative(process.cwd(),filename).replaceAll('\\','/')
  if(modules.has(id)) return id
  modules.set(id,'')
  let code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText
  code=code.replace(/require\("([^\"]+)"\)/g,(all,name)=>{
    if(name.startsWith('@/')) return `require(${JSON.stringify(bundle(name.slice(2)))})`
    if(name.startsWith('.')) return `require(${JSON.stringify(bundle(path.resolve(path.dirname(filename),name)))})`
    return all
  })
  modules.set(id,code); return id
}
const documentId=bundle('components/menu/MenuDocument.tsx')
const bridgeId=bundle('components/dashboard/TemplateEditorPreviewBridge.tsx')
const editorId=bundle('components/dashboard/MenuTemplateEditor.tsx')
const galleryId=bundle('components/dashboard/MenuTemplateGallery.tsx')
const runtime=`const modules={${[...modules].map(([id,code])=>`${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(',')}};const cache={};function require(id){if(id==='react')return React;if(id==='qrcode')return {toDataURL:async()=>window.__qr};if(id==='next/navigation')return {useRouter:()=>({refresh(){},push(url){location.href=url}})};if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;modules[id](module,module.exports,require);return module.exports;}`
const base=menuFixture(['Starters','House favourites','Drinks'])
base.restaurant.name='The Best Restaurant'
base.restaurant.description='Seasonal food · thoughtfully prepared'
base.restaurant.address='24 Garden Lane, Old Town'
base.restaurant.phone='+91 98765 43210'
base.dishes=base.dishes.slice(0,6)
const long=structuredClone(base)
long.restaurant.name='The Extraordinary Family Restaurant of Beautifully Long Names and Wonderful Shared Memories'
long.restaurant.description='Thoughtfully prepared food, shared tables and friendly conversations. '.repeat(4)
long.restaurant.address='A beautifully long address for the corner restaurant, near the old market square, Garden Road, City Centre'
long.dishes[0].name='Slow-roasted seasonal vegetables with a wonderfully long name and house-made accompaniments'
long.dishes[0].description='Prepared with carefully selected ingredients and fragrant herbs. '.repeat(8)
long.dishes[0].price=1234567.89
long.restaurant.currency='AED'
const large=structuredClone(long)
large.dishes=Array.from({length:120},(_,i)=>({...long.dishes[i%long.dishes.length],id:`large-${i}`,sort_order:i,name:`${long.dishes[i%long.dishes.length].name} ${i}`}))
const missing=structuredClone(base)
missing.restaurant.logo_url='https://example.com/missing.png'
missing.dishes[0].image_url='https://example.com/missing-food.png'
const fixtures={normal:base,long,large,missing,empty:{...base,dishes:[]}}

async function main(){
  const files=['globals','employee-operations','templates','responsive','menu-modes','category-layouts','dashboard-shell','menu-design-system','menu-editor']
  let css=(await postcss([tailwind(require('./helpers/load-typescript.cjs').loadTypeScript('tailwind.config.ts').default)]).process(files.map(f=>fs.readFileSync(`app/${f}.css`,'utf8')).join('\n'),{from:undefined})).css
  let fontRules='',fontVars=''
  if(fs.existsSync('.next-dev/static/css/app/layout.css')){
    const root=postcss.parse(fs.readFileSync('.next-dev/static/css/app/layout.css','utf8'))
    root.walkAtRules('font-face',rule=>{fontRules+=rule.toString()+'\n'})
    const mapping={manrope:'Manrope','dm-serif':'DM Serif Display',playfair:'Playfair Display',cinzel:'Cinzel',cormorant:'Cormorant Garamond',poppins:'Poppins','great-vibes':'Great Vibes',kalam:'Kalam','patrick-hand':'Patrick Hand','bodoni-moda':'Bodoni Moda'}
    for(const [key,family]of Object.entries(mapping))fontVars+=`--font-${key}:'${family}';`
  }
  css+=`\n${fontRules}\n:root{${fontVars}} body{margin:0}`
  const qr=await require('qrcode').toDataURL('http://menu.test/menu/green-bistro')
  const react=fs.readFileSync(path.join(path.dirname(require.resolve('react/package.json')),'umd/react.development.js'),'utf8')
  const dom=fs.readFileSync(path.join(path.dirname(require.resolve('react-dom/package.json')),'umd/react-dom.development.js'),'utf8')
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})})
  const context=await browser.newContext({viewport:{width:1440,height:1000}})
  const errors=[]; const results=[]; let persisted={}; let failSave=false; let failUpload=false
  const settings=settingsFixture()
  context.on('page',page=>{page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error'&&!msg.text().includes('Failed to load resource'))errors.push(msg.text())})})
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url()); const pathname=url.pathname
    if(url.hostname!=='menu.test')return route.abort()
    if(pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css})
    if(pathname==='/react.js')return route.fulfill({contentType:'text/javascript',body:react})
    if(pathname==='/react-dom.js')return route.fulfill({contentType:'text/javascript',body:dom})
    if(pathname==='/app.js')return route.fulfill({contentType:'text/javascript',body:runtime})
    if(pathname.startsWith('/templates/')){const f=path.join('public',pathname);if(fs.existsSync(f))return route.fulfill({path:f});return route.fulfill({status:404,body:''})}
    if(pathname.includes('/media/')){const f=path.join('.next-dev/static/media',path.basename(pathname));if(fs.existsSync(f))return route.fulfill({path:f});return route.fulfill({status:404,body:''})}
    if(pathname==='/api/google-fonts')return route.fulfill({json:{fonts:[]}})
    if(pathname==='/api/settings/template-image')return route.fulfill({status:failUpload?503:200,json:failUpload?{error:'Upload unavailable. Try again.'}:{imageUrl:'https://example.com/custom-art.png'}})
    if(pathname==='/api/settings'){
      const body=route.request().postDataJSON()
      if(failSave)return route.fulfill({status:503,json:{error:'Connection interrupted. Try again.'}})
      const response=await settings.PATCH(new Request('http://menu.test/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json',Origin:'http://menu.test'},body:JSON.stringify(body)}))
      const result=await response.json()
      persisted=settings.state.restaurant.template_settings
      return route.fulfill({status:response.status,json:result})
    }
    const template=url.searchParams.get('template')||'A'
    const fixture=url.searchParams.get('fixture')||'normal'
    const data=structuredClone(fixtures[fixture]||base)
    data.restaurant.template=template;data.restaurant.template_settings=structuredClone(persisted)
    const editor=pathname==='/editor', gallery=pathname==='/gallery',preview=pathname==='/dashboard/menu-preview'
    const props=editor?{template,savedDesign:persisted[template],categories:data.categories,uncategorizedCount:0,activeTemplate:template,restaurantId:'fixture',slug:data.restaurant.slug}:gallery?{restaurant:data.restaurant}:{data}
    const component=editor?editorId:gallery?galleryId:preview?bridgeId:documentId
    const className=preview?`dashboard-menu-preview is-embedded${url.searchParams.get('thumbnail')==='1'?' is-thumbnail':''}`:''
    const body=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="app" class="${className}"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script>window.__qr=${JSON.stringify(qr)}</script><script src="/app.js"></script><script>ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(require(${JSON.stringify(component)}).default,${JSON.stringify(props)}))</script></body></html>`
    return route.fulfill({contentType:'text/html; charset=utf-8',body})
  })
  const page=await context.newPage();debugPage=page
  const widths=[320,360,390,430,768,1024,1280,1440,1920]
  async function overflow(){return page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,bad:[...document.querySelectorAll('.md-dish,.md-cover-identity,.md-category,.md-closing-copy')].filter(el=>el.scrollWidth>el.clientWidth+2).map(el=>el.className)}))}
  for(const template of (process.env.MENU_QA_EDITOR_ONLY?[]:['A','B','C','D']))for(const fixture of ['normal','long','empty','large','missing']){
    await page.goto(`http://menu.test/public?template=${template}&fixture=${fixture}`)
    await page.locator('.menu-document').waitFor();await page.evaluate(()=>document.fonts.ready)
    for(const width of widths){
      await page.setViewportSize({width,height:1000})
      const check=await overflow()
      assert.ok(check.scroll<=width+1,`${template}/${fixture}/${width}: document overflow ${check.scroll}`)
      assert.deepEqual(check.bad,[],`${template}/${fixture}/${width}: text overflow`)
      results.push({template,fixture,width,overflow:false})
    }
    if(fixture==='normal'||fixture==='long'){
      await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,`${template}-${fixture}-390.png`),fullPage:true})
      await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(output,`${template}-${fixture}-1440.png`),fullPage:true})
    }
    if(fixture==='normal'){
      for(const zoom of [1.25,1.5,2]){
        await page.setViewportSize({width:1280,height:1000});await page.evaluate(zoom=>document.body.style.zoom=zoom,zoom)
        const check=await overflow();assert.ok(check.scroll<=1281,`${template} zoom ${zoom}`)
        results.push({template,zoom,overflow:false})
      }
      await page.evaluate(()=>document.body.style.zoom='')
      await page.emulateMedia({media:'print'})
      await page.pdf({path:path.join(output,`${template}-print.pdf`),format:'A4',printBackground:true,margin:{top:'10mm',bottom:'10mm',left:'10mm',right:'10mm'}})
      await page.emulateMedia({media:'screen'})
    }
  }
  for(const template of ['A','B','C','D']){
    console.log(`Checking editor ${template}`)
    await page.setViewportSize({width:1440,height:1000});await page.goto(`http://menu.test/editor?template=${template}`)
    await page.locator('.me-preview small').filter({hasText:'changes appear'}).waitFor()
    await page.getByLabel('Signature color hex code').fill('#563d29')
    await page.getByLabel('Heading font',{exact:true}).selectOption('serif')
    const frame=page.frameLocator('iframe')
    await frame.locator('.menu-document').waitFor()
    await page.waitForFunction(()=>document.querySelector('iframe').contentDocument.querySelector('.menu-document').style.getPropertyValue('--menu-primary')==='#563d29')
    await page.getByRole('button',{name:'Undo',exact:false}).click()
    await page.getByLabel('Signature color hex code').fill('#563d29')
    failSave=true;await page.getByRole('button',{name:'Save design',exact:true}).click();await page.getByRole('alert').filter({hasText:'Connection interrupted'}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Save design',exact:true}).isEnabled(),true)
    failSave=false;await page.getByRole('button',{name:'Save design',exact:true}).click();await page.getByText('Saved. Your live menu is up to date.',{exact:true}).waitFor()
    await page.reload();assert.equal(await page.getByLabel('Signature color hex code').inputValue(),'#563d29')
    await frame.locator('.md-dish').first().waitFor()
    const previewMarkup=await frame.locator('.md-content').innerHTML()
    const publicPage=await context.newPage();await publicPage.goto(`http://menu.test/public?template=${template}`);await publicPage.locator('.md-dish').first().waitFor()
    assert.equal(await publicPage.locator('.md-content').innerHTML(),previewMarkup,`${template} public/preview content parity`)
    const frameWidth=await page.locator('iframe').evaluate(el=>el.clientWidth)
    await publicPage.setViewportSize({width:frameWidth,height:1000})
    await publicPage.evaluate(()=>document.fonts.ready)
    await page.locator('iframe').evaluate(el=>el.contentDocument.fonts.ready)
    const publicStyle=await publicPage.locator('.md-cover h1').evaluate(el=>{const s=getComputedStyle(el);return [s.fontFamily,s.fontSize,s.lineHeight,s.color,el.getBoundingClientRect().width]})
    const previewStyle=await frame.locator('.md-cover h1').evaluate(el=>{const s=getComputedStyle(el);return [s.fontFamily,s.fontSize,s.lineHeight,s.color,el.getBoundingClientRect().width]})
    assert.deepEqual(publicStyle,previewStyle,`${template} computed public/preview typography parity`)
    await publicPage.close()
    // Wording, undo, reset confirmation, recovery, image failure and a cancelled departure.
    await page.locator('summary').filter({hasText:'Menu wording'}).click()
    await page.getByLabel('Opening hours',{exact:true}).fill('Every day\n9 AM – 9 PM')
    await page.getByRole('button',{name:'Save design',exact:true}).click()
    await page.getByText('Saved. Your live menu is up to date.',{exact:true}).waitFor()
    await page.reload();await page.locator('summary').filter({hasText:'Menu wording'}).click()
    assert.equal(await page.getByLabel('Opening hours',{exact:true}).inputValue(),'Every day\n9 AM – 9 PM')
    await page.getByLabel('Signature color hex code').fill('#ffffff')
    await page.getByText(/This color has low contrast/).waitFor()
    await page.getByRole('button',{name:'Use template color'}).click()
    await page.getByLabel('Signature color hex code').fill('#654321')
    page.once('dialog',dialog=>dialog.dismiss())
    await page.getByRole('link',{name:'All templates',exact:false}).click()
    assert.ok(page.url().includes('/editor'))
    page.once('dialog',dialog=>dialog.accept());await page.reload()
    await page.getByRole('button',{name:'Restore draft',exact:true}).click()
    assert.equal(await page.getByLabel('Signature color hex code').inputValue(),'#654321')
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Reset design',exact:true}).click()
    await page.getByRole('button',{name:'Undo',exact:false}).click()
    assert.equal(await page.getByLabel('Signature color hex code').inputValue(),'#654321')
    await page.locator('summary').filter({hasText:'Images & backgrounds'}).click()
    failUpload=true
    await page.locator('input[type=file]').first().setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from(qr.split(',')[1],'base64')})
    await page.getByRole('alert').filter({hasText:'Upload unavailable'}).waitFor()
    failUpload=false
    assert.equal(await page.getByRole('button',{name:'Save design',exact:true}).isEnabled(),true)
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Revert saved',exact:true}).click()
    // Expanded groups must fit too; include all controls in geometry checks.
    await page.locator('details').evaluateAll(elements=>elements.forEach(el=>el.open=true))
    for(const width of widths){
      await page.setViewportSize({width,height:1000})
      for(const dark of [false,true]){
        await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark)
        const measure=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,boxes:[...document.querySelectorAll('.me-header,.me-workspace,.me-intro,.me-group,.me-preview')].map(el=>{const r=el.getBoundingClientRect();return [r.width,r.height,r.x,r.y]})}))
        assert.ok(measure.scroll<=width+1,`${template}/editor/${width} overflow`)
        if(!dark) page._light=measure.boxes;else assert.deepEqual(measure.boxes,page._light,`${template}/${width} theme geometry`)
      }
    }
    await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(output,`${template}-editor-dark.png`),fullPage:true})
    await page.evaluate(()=>document.documentElement.classList.remove('dark'));await page.screenshot({path:path.join(output,`${template}-editor-light.png`),fullPage:true})
    await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Preview menu',exact:true}).click();await page.screenshot({path:path.join(output,`${template}-editor-phone.png`),fullPage:true})
    results.push({template,editor:'save failure/retry/reload, preview/public content parity, theme geometry'})
  }
  await page.setViewportSize({width:1280,height:900});await page.goto('http://menu.test/gallery')
  await page.getByRole('button',{name:'Preview Heritage',exact:true}).click()
  assert.equal(await page.locator('dialog').evaluate(el=>el.open),true)
  assert.equal(await page.getByRole('button',{name:'Close preview'}).evaluate(el=>el===document.activeElement),true)
  await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(el=>el.open),false)
  for(const width of widths){await page.setViewportSize({width,height:900});assert.ok((await overflow()).scroll<=width+1,`gallery/${width}`)}
  await page.screenshot({path:path.join(output,'gallery.png'),fullPage:true})
  results.push({gallery:'real previews, dialog autofocus/Escape, responsive widths'})
  assert.deepEqual(errors,[],'browser console/runtime errors')
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({checks:results.length,results,errors},null,2))
  console.log(JSON.stringify({checks:results.length,errors,screenshots:output}))
  await browser.close()
}
main().catch(async error=>{console.error(error);if(debugPage){await debugPage.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(output,'failure.html'),await debugPage.content().catch(()=>''))}process.exit(1)})
