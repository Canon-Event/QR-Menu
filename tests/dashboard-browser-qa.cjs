// Actual dashboard SSR markup, carousel/dialog and stylesheet cascade. Auth/data
// are fixtures; this never signs in to or writes to the user's database.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server'), ts = require('typescript')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const postcss = require('postcss'), tailwind = require('tailwindcss')
const { loadServer } = require('./helpers/load-server.cjs'), { menuFixture } = require('./helpers/menu-fixture.cjs')
const output = path.resolve('artifacts/dashboard-qa'), modules = new Map()
function bundle(file) {
  let name = path.resolve(file)
  if (!path.extname(name)) name = ['.ts','.tsx'].map(ext => name + ext).find(f => fs.existsSync(f))
  const id = path.relative(process.cwd(), name).replaceAll('\\','/')
  if (modules.has(id)) return id
  modules.set(id, '')
  let code = ts.transpileModule(fs.readFileSync(name,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText
  code = code.replace(/require\("([^"]+)"\)/g, (all,n) => n.startsWith('@/') ? `require(${JSON.stringify(bundle(n.slice(2)))})` : n.startsWith('.') ? `require(${JSON.stringify(bundle(path.resolve(path.dirname(name),n)))})` : all)
  modules.set(id, code); return id
}
async function main() {
  fs.mkdirSync(output,{recursive:true})
  const data = menuFixture(['Starters','Mains','Drinks'])
  Object.assign(data.restaurant, { name: 'The Best Restaurant', slug: 'the-best-restaurant', tier: 1, template: 'A' })
  const query = table => {
    const result = { data: table === 'restaurants' ? [data.restaurant] : table === 'dishes' ? data.dishes.slice(0,4) : [], count: { dishes: 6, categories: 3, menu_visits: 7, ingredients: 0 }[table] || 0 }
    const q = { select:()=>q, eq:()=>q, order:()=>q, limit:()=>q, then:(resolve,reject)=>Promise.resolve(result).then(resolve,reject) }; return q
  }
  const browserAuth = () => ({ auth: { getUser: async()=>({data:{user:{email:'owner@example.test'}}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}), signOut:async()=>{} } })
  const page = loadServer('app/dashboard/page.tsx', {
    '@/lib/supabase-server': { createSupabaseServerClient: async()=>({auth:{getUser:async()=>({data:{user:{id:'fixture-owner',email:'owner@example.test',user_metadata:{full_name:'Restaurant owner'}}}})},from:query}) },
    '@/lib/supabase-browser': { createSupabaseBrowserClient: browserAuth },
    '@/lib/reporting': { financialSummary: async()=>({summary:{net_collected_paise:0}}) },
    'next/navigation': { useRouter:()=>({push(){},refresh(){}}) },
  }, { NEXT_PUBLIC_BASE_URL: 'https://dashboard.test' }).default
  const home = renderToStaticMarkup(await page())
  const MenuDocument = loadServer('components/menu/MenuDocument.tsx').default
  const carousel = bundle('components/dashboard/DashboardTemplateBrowser.tsx'), shell = bundle('components/dashboard/DashboardRouteShell.tsx')
  const runtime = `const modules={${[...modules].map(([id,code])=>`${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(',')}};const cache={};function require(id){if(id==='react')return React;if(id==='next/link')return p=>React.createElement('a',p,p.children);if(id==='next/navigation')return {usePathname:()=>location.pathname};if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}`
  const styles = ['globals','employee-operations','templates','responsive','menu-modes','category-layouts','dashboard-shell','menu-design-system','menu-editor','loyalty','pos']
  const css = (await postcss([tailwind(loadServer('tailwind.config.ts').default)]).process(styles.map(n=>fs.readFileSync(`app/${n}.css`,'utf8')).join('\n'),{from:undefined})).css + '\n:root{--font-manrope:Arial;--font-dm-serif:Georgia}body{margin:0}'
  const react = fs.readFileSync(path.join(path.dirname(require.resolve('react/package.json')),'umd/react.development.js'),'utf8'), dom = fs.readFileSync(path.join(path.dirname(require.resolve('react-dom/package.json')),'umd/react-dom.development.js'),'utf8')
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})})
  const context = await browser.newContext({viewport:{width:1550,height:900}}), checks = [], errors = []
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)))
  await context.route('**/*',async route=>{
    const url = new URL(route.request().url()), p = url.pathname
    if (url.hostname !== 'dashboard.test') return route.abort()
    const asset = {'/style.css':['text/css',css],'/react.js':['text/javascript',react],'/dom.js':['text/javascript',dom],'/runtime.js':['text/javascript',runtime]}[p]
    if (asset) return route.fulfill({contentType:asset[0],body:asset[1]})
    if (/^\/(assets|templates)\//.test(p)) {
      const file = path.resolve('public','.'+p)
      if (file.startsWith(path.resolve('public')+path.sep) && fs.existsSync(file)) return route.fulfill({path:file})
      return route.fulfill({status:404,body:''})
    }
    let html, script = ''
    if (p === '/dashboard/menu-preview') {
      const template = url.searchParams.get('template') || 'A', fixture = {...data,restaurant:{...data.restaurant,template}}
      html = `<main class="dashboard-menu-preview is-embedded ${url.searchParams.has('thumbnail')?'is-thumbnail':''}">${renderToStaticMarkup(React.createElement(MenuDocument,{data:fixture}))}</main>`
    } else if (p === '/dashboard') {
      html = home
      script = `const old=document.querySelector('.dashboard-template-browser'),mount=document.createElement('div');old.replaceWith(mount);ReactDOM.createRoot(mount).render(React.createElement(require(${JSON.stringify(carousel)}).default,{activeTemplate:'A'}));`
    } else {
      html = '<div id="shell"></div>'
      script = `ReactDOM.createRoot(document.getElementById('shell')).render(React.createElement(require(${JSON.stringify(shell)}).default,null,React.createElement('main',{className:'analytics-page'},React.createElement('h1',null,'Orders'),React.createElement('div',{style:{height:1500}},'Fixture content'))));`
    }
    return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body>${html}<script src="/react.js"></script><script src="/dom.js"></script><script src="/runtime.js"></script><script>${script}</script></body></html>`})
  })
  const tab = await context.newPage()
  try {
    await tab.goto('https://dashboard.test/dashboard')
    await tab.getByRole('button',{name:'Preview Heritage, current design'}).waitFor()
    for (const theme of ['light','dark']) {
      await tab.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),theme==='dark')
      await tab.locator('.templates-panel').scrollIntoViewIfNeeded()
      const colors = await tab.evaluate(()=>({
        cards:[...document.querySelectorAll('.dashboard-design-open')].map(e=>getComputedStyle(e).backgroundColor),
        controls:[...document.querySelectorAll('.dashboard-design-controls button,.topbar-actions button')].map(e=>getComputedStyle(e).backgroundColor),
        label:getComputedStyle(document.querySelector('.dashboard-design-copy b')).color,
      }))
      for(const bg of [...colors.cards,...colors.controls])assert.notEqual(bg,'rgb(70, 95, 255)',`${theme} neutral control became solid blue`)
      assert.notEqual(colors.label,theme==='light'?'rgb(255, 255, 255)':'rgb(16, 24, 40)')
      const nav = await tab.locator('.dashboard-sidebar').boundingBox();assert.ok(Math.abs(nav.y)<2,'Sidebar must remain at viewport top while content scrolls');assert.ok(nav.height<=901)
      assert.ok(await tab.locator('.dashboard-sidebar').evaluate(el=>{el.scrollTop=el.scrollHeight;return el.scrollTop>0}),'Long navigation must scroll independently')
      const settings=tab.locator('.dashboard-sidebar a[href="/dashboard/settings"]').last();await settings.scrollIntoViewIfNeeded();const settingsBox=await settings.boundingBox();assert.ok(settingsBox.y>=0&&settingsBox.y+settingsBox.height<=901)
      await tab.locator('.dashboard-sidebar').evaluate(el=>{el.scrollTop=0})
      await tab.screenshot({path:path.join(output,`desktop-${theme}.png`),fullPage:false})
      await tab.getByRole('button',{name:'Preview Heritage, current design'}).click()
      const dialog=tab.getByRole('dialog');await dialog.waitFor()
      assert.equal(await dialog.evaluate(el=>{const b=el.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+30)?.closest('dialog')===el}),true,'Preview must be above navigation/header')
      await tab.waitForFunction(()=>{const p=document.querySelector('.dashboard-design-dialog-preview'),f=p?.querySelector('iframe');return p?.getAttribute('aria-busy')==='false'&&f&&getComputedStyle(f).opacity==='1'})
      await tab.screenshot({path:path.join(output,`preview-${theme}.png`),fullPage:false});await tab.keyboard.press('Escape');await dialog.waitFor({state:'hidden'})
      assert.notEqual(await tab.evaluate(()=>document.body.style.overflow),'hidden')
      checks.push(`${theme}: neutral cards/header/arrow controls; persistent independently scrolling navigation; preview opens above header and closes normally`)
    }
    for(const width of [390,767,768,1024,1550]) {
      await tab.setViewportSize({width,height:900});await tab.goto('https://dashboard.test/dashboard')
      assert.ok(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Home overflow at ${width}`)
      if(width<768){await tab.locator('.dashboard-mobile-navigation summary').click();assert.equal(await tab.locator('.dashboard-mobile-navigation nav').isVisible(),true)}
      else assert.equal(await tab.locator('.dashboard-sidebar').isVisible(),true)
      await tab.goto('https://dashboard.test/dashboard/orders');await tab.locator('.dashboard-route-shell').waitFor()
      assert.equal(await tab.getByRole('navigation',{name:'Dashboard navigation'}).isVisible(),true,`Route navigation missing at ${width}`)
      const box=await tab.locator('.dashboard-sidebar').boundingBox()
      if(width<768)assert.ok(Math.abs(box.width-width)<2,`Mobile navigation must span the viewport at ${width}`)
      assert.ok(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Route overflow at ${width}`)
      if(width===390){await tab.evaluate(()=>document.documentElement.classList.add('dark'));await tab.waitForFunction(()=>getComputedStyle(document.querySelector('.dashboard-sidebar .dashboard-nav a:not([aria-current])')).color==='rgb(208, 213, 221)');await tab.screenshot({path:path.join(output,'mobile-navigation-dark.png'),fullPage:false})}
    }
    checks.push('Home and route navigation remain usable without horizontal overflow at 390, 767, 768, 1024 and 1550px')
    assert.deepEqual(errors,[]);const report={checks,errors};fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
  }catch(e){await tab.screenshot({path:path.join(output,'failure.png'),fullPage:false});throw e}
  finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
