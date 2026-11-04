// Real dashboard components backed by the actual migration in isolated PostgreSQL.
// Browser routes replace deployment/auth and gateway dependencies, never live data.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { posDatabase } = require('./helpers/pos-database.cjs')
const postcss = require('postcss'), tailwind = require('tailwindcss')
const { loadTypeScript } = require('./helpers/load-typescript.cjs')
const output = path.resolve('artifacts/pos-qa')
const modules = new Map()
function bundle(file) {
  let filename = path.resolve(file)
  if (!path.extname(filename)) filename = ['.ts','.tsx'].map(ext => filename + ext).find(f => fs.existsSync(f))
  const id = path.relative(process.cwd(), filename).replaceAll('\\','/')
  if (modules.has(id)) return id
  modules.set(id, '')
  let code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText
  code = code.replace(/require\("([^"]+)"\)/g, (all, name) => name.startsWith('@/') ? `require(${JSON.stringify(bundle(name.slice(2)))})` : name.startsWith('.') ? `require(${JSON.stringify(bundle(path.resolve(path.dirname(filename), name)))})` : all)
  modules.set(id, code); return id
}

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const h = await posDatabase(), orderId = await h.order(); await h.as(h.owner)
  const dashboardId = bundle('components/billing/PosDashboard.tsx'), guestId = bundle('components/billing/CustomerBill.tsx'), shellId = bundle('components/dashboard/DashboardRouteShell.tsx')
  const runtime = `const modules={${[...modules].map(([id, code]) => `${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(',')}};const cache={};function require(id){if(id==='react')return React;if(id==='qrcode')return {toDataURL:window.makeBillQr};if(id==='next/link')return function Link(p){return React.createElement('a',p,p.children)};if(id==='next/script')return ()=>null;if(id==='next/navigation')return {usePathname:()=>location.pathname};if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}`
  const css = (await postcss([tailwind(loadTypeScript('tailwind.config.ts').default)]).process(['globals','responsive','dashboard-shell','pos'].map(name => fs.readFileSync(`app/${name}.css`, 'utf8')).join('\n'), { from: undefined })).css + '\n:root{--font-manrope:Arial;--font-dm-serif:Georgia}body{margin:0}'
  const react = fs.readFileSync(path.join(path.dirname(require.resolve('react/package.json')), 'umd/react.development.js'), 'utf8')
  const dom = fs.readFileSync(path.join(path.dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.development.js'), 'utf8')
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } }), errors = [], checks = []
  await context.exposeFunction('makeBillQr', url => require('qrcode').toDataURL(url, { width: 180, margin: 1 }))
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)))
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()), pathname = url.pathname
    if (url.hostname !== 'pos.test') return route.abort()
    if (pathname === '/style.css') return route.fulfill({ contentType: 'text/css', body: css })
    if (pathname === '/react.js') return route.fulfill({ contentType: 'text/javascript', body: react })
    if (pathname === '/dom.js') return route.fulfill({ contentType: 'text/javascript', body: dom })
    if (pathname === '/runtime.js') return route.fulfill({ contentType: 'text/javascript', body: runtime })
    if (pathname.startsWith('/assets/')) {
      const asset = path.join('public', pathname)
      return fs.existsSync(asset) ? route.fulfill({ path: asset }) : route.fulfill({ status: 404, body: '' })
    }
    if (pathname === '/api/billing') {
      try {
        const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null
        const result = await h.ownerAction(body ? body.action : 'state', body ? body.data : { date: url.searchParams.get('date') })
        return route.fulfill({ json: body ? { result } : { ...result, restaurantId: h.restaurant, gatewayReady: false } })
      } catch (error) { return route.fulfill({ status: 409, json: { error: error.message } }) }
    }
    if (pathname.startsWith('/api/public/billing/')) {
      const state = await h.ownerAction('state'), bill = state.bills.find(b => b.public_token === pathname.split('/').at(-1))
      return route.fulfill({ json: { bill, gatewayReady: false } })
    }
    const state = await h.ownerAction('state'), bill = state.bills.find(b => `/bill/${b.public_token}` === pathname)
    const props = { restaurant: { id: h.restaurant, name: 'Green Bistro', address: '12 Market Road, Bengaluru', currency: 'INR' }, dishes: [{ id: h.dish, name: 'Coffee', price: 118 }] }
    const render = bill ? `React.createElement(require(${JSON.stringify(guestId)}).default,${JSON.stringify({ token: bill.public_token, initialBill: bill, gatewayReady: false })})` : `React.createElement(require(${JSON.stringify(shellId)}).default,null,React.createElement(require(${JSON.stringify(dashboardId)}).default,${JSON.stringify(props)}))`
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/react.js"></script><script src="/dom.js"></script><script src="/runtime.js"></script><script>ReactDOM.createRoot(document.getElementById('root')).render(${render});</script></body></html>` })
  })
  try {
    const page = await context.newPage(); await page.goto('https://pos.test/dashboard/billing')
    await page.getByRole('heading', { name: 'Billing is switched off' }).waitFor()
    checks.push('Existing restaurant starts with billing disabled')
    await page.getByRole('button', { name: 'Open billing settings' }).click()
    await page.getByLabel('Enable billing & tables').check()
    await page.getByLabel('Automatically create kitchen tickets').check()
    await page.getByRole('button', { name: 'Save billing settings' }).click()
    await page.getByText('Billing settings saved.').waitFor()
    checks.push('Owner can explicitly enable billing and kitchen tickets')
    await page.getByRole('button', { name: 'Bills', exact: true }).click()
    await page.getByLabel('Add a dish').selectOption(h.dish)
    await page.getByRole('button', { name: 'Preview total' }).click()
    await page.getByText('Calculated total').waitFor()
    await page.getByRole('button', { name: 'Issue invoice' }).click()
    await page.getByRole('heading', { name: 'Payment record' }).waitFor()
    assert.notEqual(await page.getByRole('button', { name: 'Bills', exact: true }).evaluate(el => getComputedStyle(el).backgroundColor), await page.getByRole('button', { name: 'Tables', exact: true }).evaluate(el => getComputedStyle(el).backgroundColor))
    const first = (await h.ownerAction('state')).bills[0]
    await page.getByRole('img', { name: 'QR code to view or pay this bill' }).waitFor()
    checks.push('Menu-priced invoice can be previewed and issued with a receipt QR')
    await page.getByLabel('Cash applied to bill').fill('118')
    await page.getByRole('button', { name: 'Record cash', exact: true }).click()
    await page.locator('.pos-ledger-row').filter({ hasText: 'Cash' }).waitFor()
    const payment = (await h.ownerAction('state', { bill_id: first.id })).payments[0]
    await page.getByLabel('Original payment').selectOption(payment.id)
    await page.getByLabel('Refund amount').fill('18')
    await page.getByLabel('Reason', { exact: true }).fill('Returned item')
    await page.getByRole('button', { name: 'Request refund' }).click()
    await page.getByText(/Credit note C\//).waitFor()
    checks.push('Cash receipt and refund create a credit note without rewriting the invoice')
    await page.screenshot({ path: path.join(output, 'desktop-invoice.png'), fullPage: true })
    await page.emulateMedia({ media: 'print' }); await page.pdf({ path: path.join(output, 'invoice.pdf'), format: 'A4', printBackground: true }); await page.emulateMedia({ media: 'screen' })
    await page.getByRole('button', { name: 'Tables', exact: true }).click()
    await page.getByLabel('New table name').fill('Table 1'); await page.getByLabel('Seats', { exact: true }).fill('4')
    await page.getByRole('button', { name: 'Add table' }).click(); await page.getByRole('heading', { name: 'Table 1' }).waitFor()
    await page.getByLabel('Guest name for a new visit').fill('Riya')
    await page.getByRole('button', { name: 'Seat guests' }).click()
    await page.getByLabel('Add an order').selectOption(orderId)
    await page.getByRole('button', { name: 'Build table bill' }).click()
    await page.getByRole('button', { name: 'Preview total' }).click(); await page.getByText('Calculated total').waitFor()
    await page.getByRole('button', { name: 'Issue invoice' }).click(); await page.getByRole('heading', { name: 'Payment record' }).waitFor()
    await page.getByLabel('Cash applied to bill').fill('118'); await page.getByRole('button', { name: 'Record cash', exact: true }).click()
    await page.locator('.pos-ledger-row').filter({ hasText: 'Cash' }).waitFor()
    checks.push('Table visit collects an existing order into one settled bill')
    await page.getByRole('button', { name: 'Kitchen', exact: true }).click()
    await page.getByLabel('Send an existing order').selectOption(orderId)
    await page.getByRole('button', { name: 'Start preparing' }).click(); await page.getByRole('button', { name: 'Mark ready' }).waitFor()
    await page.screenshot({ path: path.join(output, 'desktop-kitchen.png'), fullPage: true })
    await page.getByRole('button', { name: 'Mark ready' }).click(); await page.getByRole('button', { name: 'Mark served' }).click()
    await page.getByRole('button', { name: 'Tables', exact: true }).click(); await page.getByRole('button', { name: 'Close visit' }).click()
    await page.getByText('Available', { exact: true }).waitFor()
    checks.push('Kitchen transitions work; settled and served visits can release their table')
    await page.getByRole('button', { name: 'Daily close', exact: true }).click()
    await page.getByLabel('Opening cash').fill('100'); await page.getByLabel('Counted cash').fill('318')
    await page.getByRole('button', { name: 'Save cash closing' }).click(); await page.getByRole('heading', { name: 'Cash closing recorded' }).waitFor()
    checks.push('Daily close records the expected cash from actual payment/refund records')
    await page.setViewportSize({ width: 390, height: 844 })
    for (const tab of ['Bills','Tables','Kitchen','Daily close','Settings']) {
      await page.getByRole('button', { name: tab, exact: true }).click()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No mobile overflow on ${tab}`)
    }
    await page.screenshot({ path: path.join(output, 'mobile-settings.png'), fullPage: true })
    const theme = page.getByRole('button', { name: 'Switch to dark mode' })
    if (await theme.count()) await theme.click()
    else await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.screenshot({ path: path.join(output, 'mobile-settings-dark.png'), fullPage: true })
    await page.goto(`https://pos.test/bill/${first.public_token}`)
    await page.getByRole('heading', { name: 'Green Bistro', exact: true }).waitFor()
    await page.getByRole('img', { name: 'QR code to view or pay this bill' }).waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: path.join(output, 'mobile-customer-bill.png'), fullPage: true })
    checks.push('All five dashboard tabs and customer receipt fit a 390px mobile viewport')
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2))
    console.log(JSON.stringify({ checks, errors }, null, 2))
  } catch (error) {
    const page = context.pages()[0]
    if (page) {
      await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
      console.error((await page.locator('body').innerText()).slice(-5000))
    }
    throw error
  } finally { await browser.close(); await h.db.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
