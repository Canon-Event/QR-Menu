const {test}=require('node:test'),assert=require('node:assert/strict')
const {loadServer}=require('./helpers/load-server.cjs'),m=loadServer('lib/menu-ocr.ts'),shared=loadServer('lib/ai-menu.ts')
const line=(text,x,y,width=120,score=.99)=>({text,score,poly:[[x,y],[x+width,y],[x+width,y+20],[x,y+20]]})
const upload=items=>({version:m.MENU_OCR_VERSION,imageHashes:['a'.repeat(64)],pages:[{width:600,height:800,items}]})

test('real Half/Full observations retain all 24 dishes as 32 explicitly sized options, including an uncertain price',()=>{
  const draft=m.draftFromOcr(require('./fixtures/menu-ocr-half-full.json'))
  assert.equal(draft.items.length,32)
  assert.deepEqual(draft.items.reduce((counts,i)=>(counts[i.category]=(counts[i.category]||0)+1,counts),{}),{SOUP:3,'NON VEG SOUP':3,'TANDOORI SNACKS':14,'CHINESE STARTERS':12})
  assert.deepEqual(draft.items.filter(i=>i.name.startsWith('Chicken Tikka')).map(i=>[i.name,i.price]),[['Chicken Tikka (8 pcs) (Half)',140],['Chicken Tikka (8 pcs) (Full)',230]])
  assert.deepEqual(draft.items.filter(i=>i.name.startsWith('Honey Chilly')).map(i=>[i.name,i.price]),[['Honey Chilly Potato (Half)',100],['Honey Chilly Potato (Full)',150]])
  const low=draft.items.find(i=>i.name==='Veg Manchow (Full)');assert.equal(low.price,null);assert.match(low.note,/confidence/)
  assert.equal(draft.items.filter(i=>i.price===null).length,1)
  assert.equal(draft.currency,null,'Rs. alone is ambiguous between rupee currencies')
  assert.ok(draft.items.every(i=>i.isVeg===null&&i.source))
  assert.ok(!draft.items.some(i=>['HALF','FULL','Rs.'].includes(i.category)||/^Rs/.test(i.name)))
  assert.ok(draft.items.some(i=>i.name==='Crispy Com (Full)'),'OCR spelling is preserved for owner review, never replaced using the answer fixture')
})

test('Rs. tokens do not become dishes or variants, and touching section boxes stay with their first dish',()=>{
  const draft=m.draftFromOcr(upload([
    line('SOUP',20,80,60),line('HALF',360,80,55),line('FULL',460,80,50),
    line('Manchow',20,100,120),line('Rs.',460,100,30),line('80',500,100,30),
    line('NON VEG SOUP',20,135,150),line('Chicken Soup',20,150,130),line('Rs.110',460,150,70),
  ]))
  assert.deepEqual(draft.items.map(i=>[i.category,i.name,i.price]),[['SOUP','Manchow (Full)',80],['NON VEG SOUP','Chicken Soup (Full)',110]])
  const malformed=m.draftFromOcr(upload([line('Soup',20,80),line('Hot & Sour',20,120),line('Rs.I80',460,120,70)]))
  assert.equal(malformed.items[0].price,null);assert.match(malformed.items[0].note,/Rs.I80/)
  const inlineRs=m.draftFromOcr(upload([line('Soup',20,80),line('Hot & Sour Rs.80',20,120,230)]))
  assert.equal(inlineRs.items[0].price,80);assert.equal(inlineRs.items[0].name,'Hot & Sour')
})

test('only explicit distinct size columns split variants; repeated or missing column labels require review',()=>{
  const make=(headers,prices)=>m.draftFromOcr(upload([...headers,line('Chicken Tikka',20,140,150),...prices]))
  const sized=make([line('TANDOORI',20,80),line('HALF',360,80,55),line('FULL',460,80,50)],[line('Rs.140',360,140,55),line('Rs.230',460,140,60)])
  assert.deepEqual(sized.items.map(i=>[i.name,i.price]),[['Chicken Tikka (Half)',140],['Chicken Tikka (Full)',230]])
  const unknown=make([line('TANDOORI',20,80)],[line('Rs.140',360,140,55),line('Rs.230',460,140,60)])
  assert.equal(unknown.items.length,1);assert.equal(unknown.items[0].price,null);assert.match(unknown.items[0].note,/Multiple prices/)
  const duplicate=make([line('TANDOORI',20,80),line('FULL',460,80,50),line('FULL',360,80,55)],[line('Rs.140',360,140,55),line('Rs.230',460,140,60)])
  assert.equal(duplicate.items.length,1);assert.equal(duplicate.items[0].price,null)
})

test('real two-column OCR keeps centered/right-aligned headings and repeated names in their printed sections',()=>{
  const draft=m.draftFromOcr(require('./fixtures/menu-ocr-four-sections.json'))
  const expected=require('../scripts/ocr-benchmark/expected-four-sections.json')
  const normalized=rows=>rows.map(({category,name,price})=>[category,name.toLowerCase(),price]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
  assert.deepEqual(normalized(draft.items),normalized(expected.rows))
  assert.deepEqual(Object.fromEntries(expected.headings.map(category=>[category,draft.items.filter(i=>i.category===category).length])),{SIDES:7,DRINKS:6,DESSERT:5,ENTREES:7})
  assert.equal(draft.items.filter(i=>i.name==='French Fries with Aioli').length,2)
})

test('heading matching stays within a column and supports mixed-case headings away from the dish margin',()=>{
  const draft=m.draftFromOcr(upload([
    line('OUR MENU',170,10,250),line('Sides',100,80,60),line('Drinks',440,80,70),
    line('Fries',20,120,80),line('3.50',240,120,40),line('Water',320,120,70),line('1.50',540,120,40),
    line('Dessert',80,300,90),line('Cake',20,340,60),line('5.00',240,340,40),line('Tea',320,340,60),line('2.00',540,340,40),
    line('Entrées',400,450,80),line('Fries',320,490,80),line('4.00',540,490,40),
  ]))
  assert.deepEqual(draft.items.map(i=>[i.name,i.category]),[['Fries','Sides'],['Water','Drinks'],['Cake','Dessert'],['Tea','Drinks'],['Fries','Entrées']])
  const missing=m.draftFromOcr(upload([line('SIDES',90,80,60),line('Water',320,120,70),line('1.50',540,120,40)]))
  assert.equal(missing.items[0].category,'General','A missing heading must not borrow the other column’s heading')
})
test('matches staggered columns with literal names/prices and normalized original-row references',()=>{
  const draft=m.draftFromOcr(upload([line('MAIN COURSE',30,80),line('Cheeseburger',30,120),line('$34',210,120,35),line('APPETIZERS',320,280),line('Fruit Salad',320,320),line('$13',510,320,35),line('BEVERAGE',30,500),line('Iced Coffee',30,540),line('S23',210,540,35)]))
  assert.deepEqual(draft.items.map(i=>[i.category,i.name,i.price]),[['MAIN COURSE','Cheeseburger',34],['APPETIZERS','Fruit Salad',13],['BEVERAGE','Iced Coffee',null]])
  assert.equal(draft.currency,null);assert.ok(draft.items.every(i=>i.isVeg===null));assert.match(draft.items[2].note,/S23/)
  assert.ok(draft.items.every(i=>i.source.page===1&&i.source.box.every(n=>n>=0&&n<=1)))
  assert.deepEqual(shared.parseAiMenuDraft(draft),draft)
})
test('uncertain prices, price variants and unconfirmed labels never silently become final values',()=>{
  const low=m.draftFromOcr(upload([line('Drinks',30,80),line('Lassi',30,120),line('INR 90',210,120,70,.7)]))
  assert.equal(low.items[0].price,null);assert.equal(low.currency,'INR');assert.match(low.items[0].note,/confidence/)
  const multiple=m.draftFromOcr(upload([line('Drinks',30,80),line('Soup',30,120),line('$4',210,120,35),line('$7',320,120,35)]))
  assert.equal(multiple.items[0].price,null);assert.match(multiple.items[0].note,/Multiple prices/)
  const inline=m.draftFromOcr(upload([line('Drinks',30,80),line('Lassi INR 90',30,120,230)]))
  assert.equal(inline.items[0].name,'Lassi');assert.equal(inline.items[0].price,90)
  assert.throws(()=>shared.parseAiMenuDraft(inline,true),/confirm/)
})
test('rejects oversized observations, fabricated coordinates and invalid sources before matching',()=>{
  for(const patch of [{pages:[]},{version:'unknown'},{imageHashes:['bad']},{pages:[{width:1,height:800,items:[]}]},{pages:[{width:600,height:800,items:Array(601).fill(line('Dish',30,120))}]},{pages:[{width:600,height:800,items:[line('Dish',-50,120)]}]}])assert.throws(()=>m.parseOcrUpload({...upload([]),...patch}))
  assert.throws(()=>m.draftFromOcr(upload([line('Only a title',30,80)])),/No dish/)
  const draft=m.draftFromOcr(upload([line('Lassi INR 90',30,120,230)]));draft.items[0].source.box=[0,0,3,1]
  assert.throws(()=>shared.parseAiMenuDraft(draft),/source/)
})
