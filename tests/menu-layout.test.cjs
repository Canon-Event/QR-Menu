const { test } = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { loadTypeScript } = require('./helpers/load-typescript.cjs')
const { menuFixture } = require('./helpers/menu-fixture.cjs')
const { buildMenuPages, groupMenu, inferCategoryKind, parseCategoryPresentation } = loadTypeScript('lib/menu-layout.ts')

const components = { A: 'HeritageVintagePages', B: 'GreenBistroMenu', C: 'ItalianMenu', D: 'BloomBrunchMenu' }
const allSections = pages => pages.flatMap(page => page.sections)

test('reference category names resolve to their matching food artwork', () => {
  for (const [name, kind] of Object.entries({ 'Pasta & Mains': 'pasta', 'Wood-fired Favorites': 'pizza', 'Grill House': 'grill', 'Signature Sips': 'drinks', 'Soups & Salads': 'soups_salads', 'Chaat': 'indian_snacks', 'South Indian': 'south_indian', 'Waffles & Pancakes': 'breakfast', 'Our Favourites': 'other' })) assert.equal(inferCategoryKind(name), kind)
})

test('Green Bistro reference creates two distinct pages with matching pasta and pizza photos', () => {
  const data = menuFixture()
  const pages = buildMenuPages(data, 'B')
  assert.deepEqual(pages.map(page => page.layout), ['bistro-botanical', 'bistro-four'])
  assert.deepEqual(pages[0].sections.map(section => section.kind), ['starters', 'soups_salads', 'drinks'])
  assert.deepEqual(pages[1].sections.map(section => section.kind), ['pasta', 'pizza', 'grill', 'desserts'])
  assert.match(pages[1].sections[0].image, /pasta\.jpg$/)
  assert.match(pages[1].sections[1].image, /pizza\.jpg$/)
  data.categories.reverse().forEach((category, index) => { category.sort_order = index })
  assert.deepEqual(buildMenuPages(data, 'B'), pages)
})

test('missing categories keep drinks, dessert, and pasta in their illustrated slots', () => {
  const data = menuFixture(['Drinks', 'Desserts', 'Pasta'])
  const bistro = allSections(buildMenuPages(data, 'B'))
  assert.equal(bistro.find(section => section.kind === 'drinks').slot, 2)
  assert.equal(bistro.find(section => section.kind === 'desserts').slot, 3)
  const italian = allSections(buildMenuPages(data, 'C'))
  assert.deepEqual(italian.map(section => [section.kind, section.slot]), [['pasta', 0], ['desserts', 2], ['drinks', 3]])
  const heritage = allSections(buildMenuPages(data, 'A'))
  assert.equal(heritage.find(section => section.kind === 'drinks').slot, 2)
  assert.equal(heritage.find(section => section.kind === 'desserts').slot, 3)
})

test('every template renders every available dish once across overflow, unknown and missing categories', () => {
  const data = menuFixture(['Starters', 'Pasta', 'Pizza', 'Drinks', 'Desserts', 'Mains', 'Breads', 'Breakfast', 'South Indian', 'Chaat', 'Grill', 'House Favourites'])
  const pasta = data.dishes.find(dish => dish.category_id === data.categories[1].id)
  for (let index = 0; index < 23; index++) data.dishes.push({ ...pasta, id: `extra-${index}`, name: `Extra pasta ${index}` })
  data.dishes.push({ ...pasta, id: 'orphan', name: 'Orphan dish', category_id: 'deleted-category' })
  data.dishes.push({ ...pasta, id: 'unassigned', name: 'Unassigned dish', category_id: null })
  data.dishes.push({ ...pasta, id: 'hidden', name: 'Hidden dish', is_available: false })
  const expected = data.dishes.filter(dish => dish.is_available).map(dish => dish.id).sort()
  for (const template of Object.keys(components)) {
    const pages = buildMenuPages(data, template)
    assert.ok(pages.every(page => page.sections.length > 0))
    assert.deepEqual(allSections(pages).flatMap(section => section.dishes.map(dish => dish.id)).sort(), expected, template)
    const Component = loadTypeScript(`components/menu/${components[template]}.tsx`).default
    const html = renderToStaticMarkup(React.createElement(Component, { data: { ...data, restaurant: { ...data.restaurant, template } } }))
    for (const dish of data.dishes.filter(dish => dish.is_available)) assert.equal(html.split(`>${dish.name}<`).length - 1, 1, `${template}: ${dish.name}`)
    assert.ok(!html.includes('Hidden dish'))
  }
})

test('continuations retain the same illustrated slot and image', () => {
  const data = menuFixture(['Pasta'])
  data.dishes = Array.from({ length: 18 }, (_, i) => ({ ...data.dishes[0], id: `pasta-${i}` }))
  for (const template of ['B', 'C']) {
    const pages = buildMenuPages(data, template)
    const sections = allSections(pages)
    assert.ok(pages.length > 1)
    assert.ok(sections.every(section => section.slot === 0 && section.image === sections[0].image))
    assert.equal(sections[0].continued, false)
    assert.ok(sections.slice(1).every(section => section.continued))
    assert.ok(pages.every(page => page.layout === pages[0].layout))
  }
})

test('all Green Bistro page choices show each dish once and empty menus create no content pages', () => {
  const data = menuFixture()
  for (const menuPageLayout of ['four', 'botanical', 'both']) {
    data.restaurant.template_settings.B = { menuPageLayout }
    assert.equal(allSections(buildMenuPages(data, 'B')).flatMap(section => section.dishes).length, data.dishes.length)
  }
  for (const template of Object.keys(components)) assert.deepEqual(buildMenuPages({ ...data, dishes: [] }, template), [])
})

test('owner category settings override automatic type and photo without affecting other categories', () => {
  const data = menuFixture(['House Favourites', 'Pizza'])
  const id = data.categories[0].id
  data.restaurant.template_settings.B = { categoryPresentation: { [id]: { kind: 'pasta', imageUrl: 'https://example.com/house-pasta.jpg' } } }
  const [custom, pizza] = groupMenu(data, 'B')
  assert.equal(custom.kind, 'pasta')
  assert.equal(custom.image, 'https://example.com/house-pasta.jpg')
  assert.match(pizza.image, /pizza\.jpg$/)
  assert.equal(groupMenu(data, 'C')[0].kind, 'other')
})

test('unrecognized categories use neutral artwork and brunch food stays off the drinks page', () => {
  const data = menuFixture(['House Favourites', 'Breakfast', 'Mocktails'])
  assert.equal(groupMenu(data, 'B')[0].image, undefined)
  assert.deepEqual(buildMenuPages(data, 'D').map(page => page.layout), ['bloom-breakfast', 'bloom-general', 'bloom-drinks'])
})

test('category setting validation rejects invalid types, invalid IDs, and unsafe image URLs', () => {
  const id = menuFixture().categories[0].id
  assert.deepEqual(parseCategoryPresentation({ [id]: { kind: 'pizza', imageUrl: 'https://example.com/pizza.jpg' } }), { [id]: { kind: 'pizza', imageUrl: 'https://example.com/pizza.jpg' } })
  assert.deepEqual(parseCategoryPresentation({ [id]: {} }), { [id]: {} })
  for (const input of [null, [], { bad: {} }, { [id]: { kind: 'invalid' } }, { [id]: { imageUrl: 'javascript:alert(1)' } }, { [id]: { imageUrl: 1 } }]) assert.throws(() => parseCategoryPresentation(input))
})
