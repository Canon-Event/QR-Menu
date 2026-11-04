const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const {loadServer}=require('./helpers/load-server.cjs'),{menuFixture}=require('./helpers/menu-fixture.cjs')
test('basic public menu uses saved styles and dishes while keeping customer ordering/table context on the existing page',async()=>{
  const menu=menuFixture(['Drinks']);Object.assign(menu.restaurant,{logo_url:'https://images.test/restaurant-logo.webp',menu_presentation:'basic',menu_mode:'ordering',table_verification_required:true,basic_menu_style:{font:'poppins',text:'#242424',background:'#fffaf3',accent:'#92400e',density:'compact'}})
  const seen=[]
  const query=table=>{
    const q={select:()=>q,eq:()=>q,order:()=>q,single:async()=>({data:menu.restaurant}),maybeSingle:async()=>({data:null}),then:(resolve,reject)=>Promise.resolve({data:table==='categories'?menu.categories:table==='dishes'?menu.dishes:[]}).then(resolve,reject)};return q
  }
  const page=loadServer('app/menu/[slug]/page.tsx',{
    '@/lib/supabase-server':{createSupabaseServerClient:async()=>({from:query})},
    '@/components/menu/CustomerMenuActions':props=>{seen.push(props);return React.createElement('div',{'data-order-controls':'present'})},
  }).default
  const scan='65c924f9-7920-470b-84f8-06610cd10e5b'
  const html=renderToStaticMarkup(await page({params:Promise.resolve({slug:menu.restaurant.slug}),searchParams:Promise.resolve({table:scan})}))
  assert.match(html,/basic-menu-compact/);assert.match(html,/--basic-accent:#92400e/);assert.match(html,/data-order-controls="present"/)
  assert.equal(seen[0].tableScan,scan);assert.equal(seen[0].restaurant.table_verification_required,true);assert.equal(seen[0].dishes.length,menu.dishes.length)
  assert.ok(!html.includes('menu-document-page'))
  assert.match(html,/src="https:\/\/images.test\/restaurant-logo.webp"/);assert.ok(!html.includes('Add restaurant logo')&&!html.includes('Change restaurant logo'))
})
test('existing template route keeps its renderer unless basic presentation is explicitly selected',async()=>{
  const menu=menuFixture(['Drinks']);let templateRendered=0,basicRendered=0
  const query=table=>{
    const q={select:()=>q,eq:()=>q,order:()=>q,single:async()=>({data:menu.restaurant}),maybeSingle:async()=>({data:null}),then:(resolve,reject)=>Promise.resolve({data:table==='categories'?menu.categories:table==='dishes'?menu.dishes:[]}).then(resolve,reject)};return q
  }
  const page=loadServer('app/menu/[slug]/page.tsx',{
    '@/lib/supabase-server':{createSupabaseServerClient:async()=>({from:query})},
    '@/components/menu/MenuDocument':()=>{templateRendered++;return React.createElement('div',null,'Current template')},
    '@/components/menu/BasicMenu':()=>{basicRendered++;return React.createElement('div',null,'Basic menu')},
    '@/components/menu/CustomerMenuActions':()=>null,
  }).default
  for(const mode of [undefined,'template']){
    menu.restaurant.menu_presentation=mode;const html=renderToStaticMarkup(await page({params:Promise.resolve({slug:menu.restaurant.slug})}));assert.match(html,/Current template/)
  }
  assert.equal(templateRendered,2);assert.equal(basicRendered,0)
})
