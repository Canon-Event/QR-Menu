const { test } = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { loadTypeScript } = require('./helpers/load-typescript.cjs')
const { menuFixture } = require('./helpers/menu-fixture.cjs')
const { groupMenu, inferCategoryKind, parseCategoryPresentation } = loadTypeScript('lib/menu-layout.ts')
const { resolveMenuDesign, defaults, sizeControls, menuColorContrast } = loadTypeScript('lib/menu-design.ts')
const { menuDesignVariables, menuFontVariable } = loadTypeScript('lib/menu-fonts.ts')
const MenuDocument = loadTypeScript('components/menu/MenuDocument.tsx').default

test('food types match artwork without changing the owner’s category order', () => {
  for (const [name, kind] of Object.entries({ 'Pasta & Mains': 'pasta', 'Wood-fired Favorites': 'pizza', 'Grill House': 'grill', 'Signature Sips': 'drinks', 'Soups & Salads': 'soups_salads', Chaat: 'indian_snacks', 'South Indian': 'south_indian', 'Waffles & Pancakes': 'breakfast', 'Our Favourites': 'other' })) assert.equal(inferCategoryKind(name), kind)
  const data = menuFixture(['Drinks', 'Starters', 'Pasta'])
  data.categories.reverse()
  data.dishes.reverse()
  for (const template of ['A','B','C','D']) {
    const groups = groupMenu(data, template)
    assert.deepEqual(groups.map(g => g.category.name), ['Drinks','Starters','Pasta'])
    assert.deepEqual(groups[0].dishes.map(d => d.sort_order), [0,1,2])
  }
})

test('every available dish renders exactly once, including orphan and unassigned dishes', () => {
  const data = menuFixture(['Starters', 'Pasta', 'Pizza', 'Drinks', 'Desserts', 'Mains', 'Breads', 'Breakfast', 'South Indian', 'Chaat', 'Grill', 'House Favourites'])
  const dish = data.dishes[0]
  for (let i=0;i<100;i++) data.dishes.push({ ...dish, id:`extra-${i}`, name:`Extra dish ${i}` })
  data.dishes.push({ ...dish, id:'orphan', name:'Orphan dish', category_id:'deleted' }, { ...dish, id:'unassigned', name:'Unassigned dish', category_id:null }, { ...dish, id:'hidden', name:'Hidden dish', is_available:false })
  for (const template of ['A','B','C','D']) {
    const html = renderToStaticMarkup(React.createElement(MenuDocument, { data, template }))
    for (const item of data.dishes.filter(d => d.is_available)) assert.equal(html.split(`data-dish-id="${item.id}"`).length-1, 1, `${template}/${item.id}`)
    assert.ok(!html.includes('Hidden dish'))
    assert.ok(!html.includes('continued'))
  }
})

test('short menus stay together, empty categories disappear and empty menus have a customer-facing state', () => {
  const data = menuFixture(['Starters','Other','Empty'])
  data.dishes = data.dishes.filter(d => d.category_id !== data.categories[2].id).slice(0,6)
  for (const template of ['A','B','C','D']) {
    assert.deepEqual(groupMenu(data, template).map(g=>g.dishes.length), [3,3])
    const empty = renderToStaticMarkup(React.createElement(MenuDocument, { data:{...data,dishes:[]}, template }))
    assert.match(empty,/Something delicious is on its way/)
    assert.ok(!empty.includes('Add categories'))
  }
})

test('category settings and photos are isolated per template and retain category identity', () => {
  const data = menuFixture(['House Favourites','Pizza'])
  const id=data.categories[0].id
  data.restaurant.template_settings.B={categoryPresentation:{[id]:{kind:'pasta',imageUrl:'https://example.com/pasta.jpg'}}}
  const [custom,pizza]=groupMenu(data,'B')
  assert.equal(custom.kind,'pasta'); assert.equal(custom.image,'https://example.com/pasta.jpg')
  assert.match(pizza.image,/pizza\.jpg$/)
  assert.equal(groupMenu(data,'C')[0].kind,'other')
})

test('defaults, saved settings and preview CSS use exactly the same normalized typography', () => {
  for (const template of ['A','B','C','D']) {
    const design=resolveMenuDesign(template)
    assert.ok(menuColorContrast(design.primaryColor,template)>=4.5,`${template} heading contrast`)
    for (const control of sizeControls) assert.ok(design[control.key]>=control.min && design[control.key]<=control.max)
    assert.deepEqual(menuDesignVariables({},template),menuDesignVariables(design,template))
    assert.equal(menuDesignVariables({},template)['--menu-primary'],defaults[template].primaryColor)
  }
  assert.equal(menuFontVariable('serif'),'Georgia, serif')
  const normalized=resolveMenuDesign('A',{dishNameSize:0,descriptionSize:NaN,restaurantNameSize:1000,primaryColor:'oops'})
  assert.equal(normalized.dishNameSize,14); assert.equal(normalized.descriptionSize,14); assert.equal(normalized.restaurantNameSize,96)
  assert.equal(normalized.primaryColor,defaults.A.primaryColor)
  assert.equal(resolveMenuDesign('B',{menuLabel:''}).menuLabel,'')
})

test('long content and supported currencies are preserved without truncation in all templates', () => {
  const data=menuFixture(['A wonderfully long seasonal category name'])
  data.restaurant.name='The Family Restaurant of Beautifully Long Names and Wonderful Shared Memories'
  data.dishes[0].name='A very long dish name with roasted seasonal vegetables, herbs and house-made accompaniments'
  data.dishes[0].description='Slowly prepared with fresh ingredients. '.repeat(12)
  for (const template of ['A','B','C','D']) for (const currency of ['INR','USD','EUR','GBP','AED']) {
    const html=renderToStaticMarkup(React.createElement(MenuDocument,{data:{...data,restaurant:{...data.restaurant,currency}},template}))
    assert.ok(html.includes(data.restaurant.name)); assert.ok(html.includes(data.dishes[0].name)); assert.ok(html.includes(data.dishes[0].description))
  }
})

test('category validation rejects unsafe image URLs and invalid mappings',()=>{
  const id=menuFixture().categories[0].id
  assert.deepEqual(parseCategoryPresentation({[id]:{kind:'pizza',imageUrl:'https://example.com/pizza.jpg'}}),{[id]:{kind:'pizza',imageUrl:'https://example.com/pizza.jpg'}})
  for(const input of [null,[],{bad:{}},{[id]:{kind:'invalid'}},{[id]:{imageUrl:'javascript:alert(1)'}},{[id]:{imageUrl:1}}]) assert.throws(()=>parseCategoryPresentation(input))
})
