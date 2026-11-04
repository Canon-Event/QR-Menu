// Real React/CSS in Chromium; HTTP responses are fixtures, not a live restaurant.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')
const postcss = require('postcss')
const tailwind = require('tailwindcss')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { loadTypeScript } = require('./helpers/load-typescript.cjs')
const { menuFixture } = require('./helpers/menu-fixture.cjs')
const { defaultLoyaltyProgram } = loadTypeScript('lib/loyalty.ts')
const output = path.resolve(process.env.LOYALTY_QA_OUTPUT || 'artifacts/loyalty-qa')
fs.mkdirSync(output, { recursive: true })
const modules = new Map()
function bundle(file) {
  let filename = path.resolve(file)
  if (!path.extname(filename)) filename = ['.ts', '.tsx'].map(ext => filename + ext).find(f => fs.existsSync(f))
  const id = path.relative(process.cwd(), filename).replaceAll('\\', '/')
  if (modules.has(id)) return id
  modules.set(id, '')
  let code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText
  code = code.replace(/require\("([^\"]+)"\)/g, (all, name) => name.startsWith('@/') ? `require(${JSON.stringify(bundle(name.slice(2)))})` : name.startsWith('.') ? `require(${JSON.stringify(bundle(path.resolve(path.dirname(filename), name)))})` : all)
  modules.set(id, code); return id
}
const ownerId = bundle('components/loyalty/LoyaltyDashboard.tsx')
const customerId = bundle('components/loyalty/CustomerRewards.tsx')
const shellId = bundle('components/dashboard/DashboardRouteShell.tsx')
const runtime = `const modules={${[...modules].map(([id, code]) => `${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(',')}};const cache={};function require(id){if(id==='react')return React;if(id==='qrcode')return {toDataURL:async()=>window.__qr};if(id==='next/link')return function Link(p){return React.createElement('a',p,p.children)};if(id==='next/navigation')return {usePathname:()=>'/dashboard/loyalty',useRouter:()=>({refresh(){},push(){}})};if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}`

async function main() {
  const restaurant = menuFixture().restaurant
  restaurant.name = 'Green Bistro'
  const base = { ...defaultLoyaltyProgram(restaurant.id), enabled: true, reward_name: 'A complimentary coffee' }
  let program = { ...base }, locked = false, failSave = false, authenticated = false, joined = false
  const stampTime = new Date().toISOString(), expires = new Date(Date.now() + 180 * 86400000).toISOString()
  const wallet = { member: { id: 'member-1', restaurant_id: restaurant.id, card_code: 'ABCDEF123456', display_name: 'Riya', phone_last4: '3210', progress_expires_at: expires, created_at: stampTime }, stamps: Array.from({ length: 3 }, (_, index) => ({ id: `stamp-${index}`, status: 'available', paid_amount: 250, bill_reference: `2026-10-25/${index}`, created_at: stampTime })), rewards: [] }
  let lastSave
  let css = (await postcss([tailwind(loadTypeScript('tailwind.config.ts').default)]).process(['globals', 'responsive', 'dashboard-shell', 'loyalty'].map(name => fs.readFileSync(`app/${name}.css`, 'utf8')).join('\n'), { from: undefined })).css
  css += '\n:root{--font-manrope:Arial;--font-dm-serif:Georgia;--font-poppins:Arial;}body{margin:0}'
  const cssDirectory = '.next/static/css'
  if (fs.existsSync(cssDirectory)) for (const file of fs.readdirSync(cssDirectory).filter(name => name.endsWith('.css'))) {
    const root = postcss.parse(fs.readFileSync(path.join(cssDirectory, file), 'utf8'))
    root.walkAtRules('font-face', rule => { css += '\n' + rule.toString() })
    root.walkDecls(/^--font-/, declaration => { css += `\n:root{${declaration.prop}:${declaration.value}}` })
  }
  const react = fs.readFileSync(path.join(path.dirname(require.resolve('react/package.json')), 'umd/react.development.js'), 'utf8')
  const dom = fs.readFileSync(path.join(path.dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.development.js'), 'utf8')
  const qr = await require('qrcode').toDataURL('https://loyalty.test/dashboard/loyalty?member=ABCDEF123456')
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) })
  const errors = [], checks = []
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)))
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()), pathname = url.pathname
    if (url.hostname !== 'loyalty.test') return route.abort()
    if (pathname === '/style.css') return route.fulfill({ contentType: 'text/css', body: css })
    if (pathname === '/react.js') return route.fulfill({ contentType: 'text/javascript', body: react })
    if (pathname === '/dom.js') return route.fulfill({ contentType: 'text/javascript', body: dom })
    if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: runtime })
    if (pathname.includes('/media/')) { const file = path.join('.next/static/media', path.basename(pathname)); return fs.existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: '' }) }
    if (pathname.startsWith('/assets/')) { const file = path.join('public', pathname); return fs.existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: '' }) }
    if (pathname === '/api/loyalty/manage') {
      if (route.request().method() === 'GET') return route.fulfill({ json: url.searchParams.has('member') ? wallet : { program, rulesLocked: locked, stats: { members: joined ? 1 : 0, stamps: wallet.stamps.length, ready: wallet.rewards.filter(r => !r.redeemed_at).length, redeemed: 0 }, activity: [] } })
      const body = route.request().postDataJSON()
      if (body.action === 'save') {
        if (failSave) return route.fulfill({ status: 503, json: { error: 'Could not save. Please try again.' } })
        program = body.program; lastSave = body
        return route.fulfill({ json: { program } })
      }
      if (body.action === 'award') wallet.stamps.push({ id: 'stamp-new', status: 'available', paid_amount: body.paidAmount, bill_reference: body.billReference, created_at: stampTime })
      if (body.action === 'redeem') wallet.rewards.find(reward => reward.id === body.rewardId).redeemed_at = stampTime
      if (body.action === 'reverse') wallet.stamps.find(stamp => stamp.id === body.stampId).status = 'reversed'
      return route.fulfill({ json: { ok: true } })
    }
    if (pathname === '/api/loyalty/card') {
      if (route.request().method() === 'POST') { joined = true; return route.fulfill({ json: { wallet } }) }
      return route.fulfill({ json: { program, authenticated, wallet: joined ? wallet : null, phoneReady: true } })
    }
    if (pathname === '/api/loyalty/auth') {
      const body = route.request().postDataJSON()
      if (body.action === 'verify' && body.code !== '123456') return route.fulfill({ status: 400, json: { error: 'That code is incorrect or expired.' } })
      if (body.action === 'verify') authenticated = true
      if (body.action === 'signout') authenticated = joined = false
      return route.fulfill({ json: { ok: true } })
    }
    const customer = pathname === '/customer'
    const props = customer ? { restaurant, initialProgram: program } : { restaurant, phoneReady: !url.searchParams.has('sms-off'), initialMember: '' }
    const element = `React.createElement(require(${JSON.stringify(customer ? customerId : ownerId)}).default,${JSON.stringify(props)})`
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/react.js"></script><script src="/dom.js"></script><script>window.__qr=${JSON.stringify(qr)}</script><script src="/app.js"></script><script>ReactDOM.createRoot(document.getElementById('root')).render(${customer ? element : `React.createElement(require(${JSON.stringify(shellId)}).default,null,${element})`})</script></body></html>` })
  })
  const page = await context.newPage()
  try {
    await page.goto('https://loyalty.test/owner')
    await page.getByRole('button', { name: 'Save changes', exact: true }).waitFor()
    await page.getByLabel('Card title').fill('Good coffee. Better company.')
    await page.getByRole('button', { name: /Bold Confident/ }).click()
    assert.match(await page.locator('.stamp-card').getAttribute('class'), /--bold/)
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Saved.' }).waitFor()
    assert.equal(lastSave.program.title, 'Good coffee. Better company.')
    checks.push('Appearance updates and persists')
    await page.getByRole('button', { name: /Paper Warm/ }).click()
    await page.getByRole('button', { name: 'Reward ready', exact: true }).click()
    await page.getByRole('heading', { name: 'You’ve earned a treat.' }).waitFor()
    await page.getByRole('button', { name: 'Collecting', exact: true }).click()
    await page.screenshot({ path: path.join(output, 'dashboard-desktop.png'), fullPage: true })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    failSave = true
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Could not save' }).waitFor()
    assert.equal(await page.getByLabel('Card title').inputValue(), 'Good coffee. Better company.')
    failSave = false
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Saved.' }).waitFor()
    checks.push('Failed saves preserve edits and allow retry')
    await page.getByRole('tab', { name: 'Program rules' }).click()
    await page.getByLabel('Minimum paid bill').fill('100')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Saved.' }).waitFor()
    assert.equal(lastSave.program.minimum_spend, 100)
    await page.getByRole('tab', { name: 'At the counter' }).click()
    await page.getByLabel('Customer card code').fill('ABCD EF12 3456')
    await page.getByRole('button', { name: 'Find card', exact: true }).click()
    await page.getByRole('heading', { name: 'Riya', exact: true }).waitFor()
    await page.getByLabel('Unique bill reference').fill('2026-10-25/123')
    await page.getByLabel('Amount paid').fill('250')
    await page.getByRole('button', { name: 'Give 1 stamp', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'One stamp added' }).waitFor()
    assert.equal(wallet.stamps.length, 4)
    checks.push('Counter lookup and manual award')
    await page.getByRole('button', { name: 'Reverse', exact: true }).first().click()
    await page.getByLabel('Reason', { exact: true }).fill('Payment refunded')
    await page.getByRole('button', { name: 'Confirm reversal' }).click()
    await page.getByRole('status').filter({ hasText: 'Stamp reversed' }).waitFor()
    checks.push('Manual reversal with reason')
    locked = true
    await page.reload()
    await page.getByRole('tab', { name: 'Program rules' }).click()
    assert.equal(await page.getByLabel('Reward name').isDisabled(), true)
    checks.push('Existing member reward terms are locked')
    await page.getByRole('tab', { name: 'Card appearance' }).click()
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 844 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Owner overflow at ${width}`)
      await page.screenshot({ path: path.join(output, `dashboard-${width}.png`), fullPage: true })
    }
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.screenshot({ path: path.join(output, 'dashboard-dark.png'), fullPage: true })
    checks.push('Owner desktop, mobile, tablet and dark appearance')

    await page.goto('https://loyalty.test/customer')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'My rewards' }).click()
    await page.getByLabel('Phone number').fill('9876543210')
    await page.getByRole('button', { name: 'Send me a code' }).click()
    await page.getByLabel('Six-digit code').fill('000000')
    await page.getByRole('button', { name: 'Verify phone' }).click()
    await page.getByRole('alert').filter({ hasText: 'incorrect' }).waitFor()
    await page.getByLabel('Six-digit code').fill('123456')
    await page.getByRole('button', { name: 'Verify phone' }).click()
    await page.getByLabel('Your name').fill('Riya')
    await page.getByRole('button', { name: 'Join rewards', exact: true }).click()
    await page.getByText('Hi, Riya').waitFor()
    await page.getByRole('button', { name: 'Show my card at the counter' }).click()
    await page.getByAltText('Your membership QR code for the restaurant counter').waitFor()
    checks.push('Phone send, invalid code, verification, joining and membership QR')
    await page.screenshot({ path: path.join(output, 'customer-card.png'), fullPage: true })
    assert.ok(await page.locator('dialog').evaluate(element => element.scrollWidth <= element.clientWidth + 1))
    await page.keyboard.press('Escape')
    await page.locator('dialog').waitFor({ state: 'detached' })
    assert.equal(await page.locator('dialog').count(), 0)
    assert.equal(await page.getByRole('button', { name: 'My rewards' }).evaluate(element => element === document.activeElement), true)
    checks.push('Dialog closes with Escape and restores keyboard focus')
    wallet.rewards.push({ id: 'reward-1', reward_name: 'A complimentary coffee', created_at: stampTime, expires_at: expires, redeemed_at: null, revoked_at: null })
    await page.getByRole('button', { name: 'My rewards' }).click()
    await page.getByRole('button', { name: 'Show at counter', exact: true }).waitFor()
    await page.screenshot({ path: path.join(output, 'customer-reward-ready.png'), fullPage: true })
    await page.goto('https://loyalty.test/owner')
    await page.getByRole('tab', { name: 'At the counter' }).click()
    await page.getByLabel('Customer card code').fill('ABCDEF123456')
    await page.getByRole('button', { name: 'Find card', exact: true }).click()
    await page.getByRole('button', { name: 'Redeem reward', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm redemption', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Reward marked' }).waitFor()
    assert.ok(wallet.rewards[0].redeemed_at)
    checks.push('Counter reward confirmation and redemption')
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, errors, note: 'Real components with fixture API; live SMS and hosted database not exercised.' }, null, 2))
    console.log(JSON.stringify({ checks, errors, output }, null, 2))
  } catch (error) { await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); console.error(errors); throw error }
  finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
