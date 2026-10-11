const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const assert = require('node:assert/strict')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { chromium } = require('playwright')
const { loadTypeScript } = require('../../tests/helpers/load-typescript.cjs')
const { menuFixture } = require('../../tests/helpers/menu-fixture.cjs')
const { menuDesignVariables } = loadTypeScript('lib/menu-fonts.ts')

const files = { A: 'HeritageVintagePages', B: 'GreenBistroMenu', C: 'ItalianMenu', D: 'BloomBrunchMenu' }
const names = {
  A: ['Chaat', 'South Indian', 'Beverages', 'Desserts', 'Mains', 'Breads', 'House Favourites'],
  C: ['Starters', 'Pizza', 'Pasta', 'Grill House', 'Desserts', 'Drinks'],
  D: ['Pancakes', 'Waffles', 'Eggs', 'Mocktails', 'Coffee', 'Pizza'],
}
const styles = ['globals', 'templates', 'responsive', 'category-layouts']
const html = Object.fromEntries(Object.entries(files).map(([template, name]) => {
  const data = menuFixture(names[template])
  data.restaurant.template = template
  const Component = loadTypeScript(`components/menu/${name}.tsx`).default
  const menu = React.createElement(Component, { data })
  const content = template === 'A' ? React.createElement('div', { className: 'public-menu template-a heritage-menu-shell', style: { maxWidth: 512, margin: 'auto' } }, menu) : menu
  const markup = renderToStaticMarkup(React.createElement('main', { style: menuDesignVariables({}, template) }, content))
  return [template, '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">' + styles.map(style => `<link rel="stylesheet" href="/styles/${style}.css">`).join('') + '<style>*{box-sizing:border-box}body{margin:0;background:#eee8dd} :root{--font-manrope:Arial;--font-dm-serif:Georgia;--font-playfair:Georgia;--font-bodoni-moda:Georgia;--font-kalam:Georgia;--font-patrick-hand:Georgia;--font-caveat:Georgia;--font-great-vibes:Georgia}</style></head><body>' + markup + '</body></html>']
}))
const publicRoot = path.resolve('public') + path.sep
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname
  if (html[pathname.slice(1)]) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html[pathname.slice(1)]); return }
  let file
  const style = /^\/styles\/([a-z-]+)\.css$/.exec(pathname)?.[1]
  if (styles.includes(style)) { file = path.resolve(`app/${style}.css`); res.setHeader('Content-Type', 'text/css') }
  else if (pathname.startsWith('/templates/')) {
    const target = path.resolve('public', '.' + pathname)
    if (target.startsWith(publicRoot)) file = target
  }
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return }
  fs.createReadStream(file).pipe(res)
})

;(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    const page = await browser.newPage()
    const results = []
    for (const template of Object.keys(files).filter(key => !process.argv[2] || key === process.argv[2])) {
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.goto(`http://127.0.0.1:${server.address().port}/${template}`, { waitUntil: 'networkidle' })
        await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode().catch(() => {}))) })
        const layout = await page.evaluate(() => {
          const missingImages = [...document.images].filter(image => !image.naturalWidth).map(image => image.src)
          const dishes = [...document.querySelectorAll('.bistro-dish, .italian-dish, .heritage-vintage-dish, .bloom-dish, .bloom-drink')]
          const clipped = dishes.filter(dish => {
            const block = dish.closest('.bistro-inner-category, .bistro-botanical-category, .italian-inner-section, .italian-feature-section, .heritage-vintage-section, .bloom-section, .bloom-drinks-section')
            if (!block) return false
            const bounds = block.getBoundingClientRect(), row = dish.getBoundingClientRect()
            return row.bottom > bounds.bottom + 2 || row.right > bounds.right + 2
          }).map(dish => dish.textContent.slice(0, 65))
          const sample = document.querySelector('.bloom-dish h3')
          const typography = sample ? { size: getComputedStyle(sample).fontSize, font: getComputedStyle(sample).fontFamily, variable: getComputedStyle(sample).getPropertyValue('--font-caveat'), container: getComputedStyle(document.querySelector('.bloom-brunch-menu')).containerType } : null
          return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, missingImages, clipped, dishCount: dishes.length, typography }
        })
        results.push({ template, ...layout })
        await page.screenshot({ path: `artifacts/category-layouts/${template}-${width}.png`, fullPage: true })
        if (template === 'B' && width === 1440) {
          await page.locator('.bistro-menu-page').first().screenshot({ path: 'artifacts/category-layouts/bistro-four.png' })
          await page.locator('.bistro-botanical-page').first().screenshot({ path: 'artifacts/category-layouts/bistro-split.png' })
        }
      }
    }
    fs.writeFileSync('artifacts/category-layouts/layout-report.json', JSON.stringify(results, null, 2))
    console.log(JSON.stringify(results, null, 2))
    assert.ok(results.every(result => result.scrollWidth <= result.width), 'A menu overflows horizontally')
    assert.ok(results.every(result => !result.missingImages.length), 'A menu image did not load')
    assert.ok(results.every(result => !result.clipped.length), 'A dish extends outside its category section')
  } finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
