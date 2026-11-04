const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const {loadServer}=require('./helpers/load-server.cjs'),{menuFixture}=require('./helpers/menu-fixture.cjs')
const {groupMenuPortions,readPortionName}=loadServer('lib/menu-portions.ts')

test('review progress cannot acknowledge missing or invalid prices, unknown diets or changed price options',()=>{
  const {menuGroupReady,menuReviewKey,validReviewKeys}=loadServer('lib/menu-review.ts')
  const base={category:'Snacks',name:'Tikka (Half)',price:140,isVeg:true,description:'',note:''}
  const items=[base,{...base,name:'Tikka (Full)',price:230}]
  const group=groupMenuPortions(items,i=>i.category)[0],key=menuReviewKey(group)
  assert.equal(menuGroupReady(group),true);assert.deepEqual(validReviewKeys(items,[key]),[key])
  for(const price of [null,-1,1.234,Infinity,1000001]){
    const changed=[{...base,price},items[1]]
    assert.equal(menuGroupReady(groupMenuPortions(changed,i=>i.category)[0]),false)
    assert.deepEqual(validReviewKeys(changed,[key]),[])
  }
  assert.deepEqual(validReviewKeys([{...base,price:145},items[1]],[key]),[])
  assert.equal(menuGroupReady(groupMenuPortions([{...base,isVeg:null},items[1]],i=>i.category)[0]),false)
  assert.throws(()=>validReviewKeys(items,['x'.repeat(1001)]),/review status/)
})

test('32 saved options display as 24 dishes without changing prices, IDs or source records',()=>{
  const draft=loadServer('lib/menu-ocr.ts').draftFromOcr(require('./fixtures/menu-ocr-half-full.json'))
  const rows=groupMenuPortions(draft.items,item=>item.category)
  assert.equal(rows.length,24);assert.equal(rows.flatMap(row=>row.entries).length,32)
  const tikka=rows.find(row=>row.name==='Chicken Tikka (8 pcs)')
  assert.deepEqual(tikka.entries.map(e=>[e.portion,e.item.price]),[['Half',140],['Full',230]])
  for(const row of rows)for(const entry of row.entries)assert.equal(entry.item,draft.items[entry.index])
  assert.equal(rows.find(row=>row.name==='Paneer Tikka').entries.length,1,'A blank Half cell does not become a zero-price option')
})

test('categories, ordinary prices and ambiguous duplicates retain every separate entry',()=>{
  const items=[{id:'h',name:'Soup (Half)',category:'A',price:50},{id:'f',name:'Soup (Full)',category:'A',price:90},{id:'other',name:'Soup (Full)',category:'B',price:110},{id:'duplicate',name:'Soup (Full)',category:'A',price:100},{id:'single',name:'Soup',category:'A',price:80}]
  const rows=groupMenuPortions(items,i=>i.category)
  assert.equal(rows.length,4);assert.deepEqual(rows.flatMap(r=>r.entries).map(e=>e.item.id).sort(),items.map(i=>i.id).sort())
  assert.deepEqual(readPortionName('Hara Bhara Kebab (8 pcs) (Half)'),{name:'Hara Bhara Kebab (8 pcs)',portion:'Half'})
  assert.deepEqual(readPortionName('Half and Half Pizza'),{name:'Half and Half Pizza',portion:null})
  const shared=groupMenuPortions([{name:' (Half)',price:50},{name:' (Full)',price:90}]);assert.equal(shared.length,1);assert.equal(shared[0].name,'')
  assert.throws(()=>loadServer('lib/ai-menu.ts').parseAiMenuDraft({currency:'INR',warnings:[],items:[{name:' (Half)',category:'Soup',description:'',price:50,isVeg:true,note:''}]},true),/name/)
})

test('customer menu shows one dish with labeled Half/Full prices and preserves unknown prices visibly',()=>{
  const menu=menuFixture(['Tandoori']);const template=menu.dishes[0]
  menu.dishes=[{...template,id:'half',name:'Chicken Tikka (8 pcs) (Half)',price:140},{...template,id:'full',name:'Chicken Tikka (8 pcs) (Full)',price:230},{...template,id:'paneer',name:'Paneer Tikka (Full)',price:180}]
  const Basic=loadServer('components/menu/BasicMenu.tsx').default
  const html=renderToStaticMarkup(React.createElement(Basic,{data:menu,unconfirmedPriceIds:['half']}))
  assert.equal((html.match(/class="basic-menu-dish has-portions"/g)||[]).length,2)
  assert.match(html,/<h3>Chicken Tikka \(8 pcs\)<\/h3>/);assert.match(html,/data-portion="Half"/);assert.match(html,/data-portion="Full"/)
  assert.match(html,/Confirm price/);assert.match(html,/₹230\.00/);assert.match(html,/₹180\.00/);assert.doesNotMatch(html,/₹0\.00/)
  assert.match(html,/Half price not listed/)
})
