const { chromium } = require('playwright')
const fs = require('node:fs')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage()
  const results = []
  for (const route of ['/', '/plans', '/contact', '/login', '/register']) {
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`http://localhost:3100${route}`, { waitUntil: 'networkidle' })
      await page.evaluate(async () => { await Promise.all(Array.from(document.images).map(i => i.decode().catch(() => {}))); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))) })
      const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('body *')].filter(e => { const r=e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth+1 || r.left < -1) && getComputedStyle(e).position !== 'fixed' }).slice(0,8).map(e=>({tag:e.tagName,class:e.className})) }))
      results.push({ route, ...layout })
      if (width === 390 || width === 1440) await page.screenshot({ path:`artifacts/responsive/${route.replaceAll('/','') || 'home'}-${width}.png`, fullPage:true })
      if (route==='/' && width===390) {
        await page.getByRole('button', { name:'Open navigation', exact:true }).click()
        await page.getByRole('navigation', { name:'Mobile navigation', exact:true }).waitFor({state:'visible'})
        await page.keyboard.press('Escape')
        await page.getByRole('navigation', { name:'Mobile navigation', exact:true }).waitFor({state:'hidden'})
      }
    }
  }
  fs.writeFileSync('artifacts/responsive/layout-report.json', JSON.stringify(results,null,2))
  console.log(JSON.stringify(results,null,2))
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
