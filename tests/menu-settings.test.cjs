const {test}=require('node:test')
const assert=require('node:assert/strict')
const {settingsFixture}=require('./helpers/settings-fixture.cjs')
const {loadTypeScript}=require('./helpers/load-typescript.cjs')
const {resolveMenuDesign}=loadTypeScript('lib/menu-design.ts')
const {menuDesignVariables}=loadTypeScript('lib/menu-fonts.ts')
const request=body=>new Request('http://menu.test/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json',Origin:'http://menu.test'},body:JSON.stringify(body)})

test('first save preserves defaults, wording, typography and other templates through the real settings route',async()=>{
  const {PATCH,state}=settingsFixture()
  for(const template of ['A','B','C','D']){
    const before=resolveMenuDesign(template)
    const response=await PATCH(request({section:'template_customization',template,...before}))
    assert.equal(response.status,200)
    const stored=(await response.json()).restaurant.template_settings[template]
    const after=resolveMenuDesign(template,stored)
    assert.deepEqual(menuDesignVariables(before,template),menuDesignVariables(after,template))
    for(const field of ['menuLabel','thankYouTitle','thankYouMessage','coverTagline','categoryTagline','openingHours'])assert.equal(after[field],before[field],`${template}/${field}`)
    assert.equal(state.restaurant.template,'A','Saving a design must not activate it')
  }
  assert.deepEqual(Object.keys(state.restaurant.template_settings),['A','B','C','D'])
})

test('customization writes preserve menu mode and reject unsafe artwork without writes',async()=>{
  const {PATCH,state}=settingsFixture({menu_mode:'ordering'})
  const design=resolveMenuDesign('B',{primaryColor:'#563d29',restaurantNameSize:80,menuLabel:'Dinner',thankYouMessage:'Thank you for joining us.'})
  const success=await PATCH(request({section:'template_customization',template:'B',...design}))
  assert.equal(success.status,200);assert.equal(state.restaurant.menu_mode,'ordering')
  assert.equal(state.restaurant.template_settings.B.menuLabel,'Dinner')
  const writes=state.writes.length
  const invalid=await PATCH(request({section:'template_customization',template:'B',...design,imageUrl:'javascript:alert(1)'}))
  assert.equal(invalid.status,400);assert.equal(state.writes.length,writes)
})
