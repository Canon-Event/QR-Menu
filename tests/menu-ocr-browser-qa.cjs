// Real editor + official OCR worker/models + actual API/SQL; no OCR/provider response fixtures.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),ts=require('typescript')
const postcss=require('postcss'),tailwind=require('tailwindcss'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright')
const {loadServer}=require('./helpers/load-server.cjs'),{aiDatabase}=require('./helpers/ai-menu-fixture.cjs'),{menuFixture}=require('./helpers/menu-fixture.cjs')
const output=path.resolve(process.env.OCR_QA_OUTPUT||'artifacts/ai-menu-qa/ocr-integration'),modules=new Map()
function bundle(file){
  let name=path.resolve(file);if(!path.extname(name))name=['.ts','.tsx'].map(ext=>name+ext).find(f=>fs.existsSync(f))
  const id=path.relative(process.cwd(),name).replaceAll('\\','/');if(modules.has(id))return id;modules.set(id,'')
  let code=ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText
  code=code.replace(/require\((["'])([^"']+)\1\)/g,(all,quote,n)=>n.startsWith('@/')?`require(${JSON.stringify(bundle(n.slice(2)))})`:n.startsWith('.')?`require(${JSON.stringify(bundle(path.resolve(path.dirname(name),n)))})`:all)
  modules.set(id,code);return id
}
async function main(){
  fs.mkdirSync(output,{recursive:true})
  const image=path.resolve(process.argv[2]||'artifacts/ai-menu-qa/paddleocr/borcelle-canva-1131.jpg')
  assert.ok(fs.existsSync(image),'Provide the original benchmark JPEG as the first argument.')
  const expected=JSON.parse(fs.readFileSync(process.argv[3]||'scripts/ocr-benchmark/expected-borcelle.json','utf8'))
  const {groupMenuPortions,readPortionName}=loadServer('lib/menu-portions.ts')
  const dishCount=groupMenuPortions(expected.rows,row=>row.category).length
  const reviewHeading=`Menu items ${dishCount} dishes`
  const component=bundle('components/dashboard/AiMenuImporter.tsx'),renderer=bundle('components/menu/BasicMenu.tsx')
  const runtime=`const modules={${[...modules].map(([id,code])=>`${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(',')}};const cache={};function require(id){if(id==='react')return React;if(id==='next/navigation')return {useRouter:()=>({refresh(){}})};if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}`
  const react=fs.readFileSync(path.join(path.dirname(require.resolve('react/package.json')),'umd/react.development.js'),'utf8'),dom=fs.readFileSync(path.join(path.dirname(require.resolve('react-dom/package.json')),'umd/react-dom.development.js'),'utf8')
  const css=(await postcss([tailwind(loadServer('tailwind.config.ts').default)]).process(['globals','templates','responsive','menu-design-system','menu-editor','ai-menu','menu-studio'].map(s=>fs.readFileSync(`app/${s}.css`,'utf8')).join('\n'),{from:undefined})).css
  const db=await aiDatabase(),posts=[],assets=[],errors=[];let failSave=true,providerCalls=0
  async function rpc(name,args,admin=false){await db.as(admin?null:db.owner,admin?'service_role':'authenticated');try{return {data:await db.call(name,Object.values(args)),error:null}}catch(error){return {data:null,error:{code:error.code}}}}
  const api=loadServer('app/api/menu/ai/route.ts',{
    '@/lib/menu-api':{...loadServer('lib/menu-api.ts'),getOwnedRestaurant:async()=>({restaurantId:db.restaurant,supabase:{rpc:(n,a)=>rpc(n,a)}})},
    '@/lib/supabase':{supabaseAdmin:()=>({rpc:(n,a)=>rpc(n,a,true)})},
    '@/lib/ai-menu-server':{...loadServer('lib/ai-menu-server.ts'),extractMenu:async()=>{providerCalls++;throw Error('Local OCR must not invoke a provider.')}},
  },{SUPABASE_SERVICE_ROLE_KEY:'fixture-service'})
  const menu=menuFixture(['Drinks']);menu.restaurant.id=db.restaurant;menu.restaurant.currency='INR'
  const monitor=`window.ocrWorkers={created:0,active:0,beats:0,maxGap:0,errors:[]};const NativeWorker=Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.counted=true;ocrWorkers.created++;ocrWorkers.active++;this.addEventListener('message',event=>{if(event.data?.status==='error')ocrWorkers.errors.push(event.data)});}terminate(){if(this.counted){this.counted=false;ocrWorkers.active--;}super.terminate();}};let last=performance.now();setInterval(()=>{const now=performance.now();if(ocrWorkers.active){ocrWorkers.beats++;ocrWorkers.maxGap=Math.max(ocrWorkers.maxGap,now-last);}last=now;},16);`
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost'),p=url.pathname
      if(p==='/api/menu/ai'){
        const buffers=[];for await(const part of req)buffers.push(part);const body=Buffer.concat(buffers)
        if(req.method==='POST'){posts.push({type:req.headers['content-type'],bytes:body.length,body:JSON.parse(body.toString())});if(failSave){failSave=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Temporary draft save failure.'}));return}}
        const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,...(body.length?{body}: {})})
        const result=await api[req.method](request);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return
      }
      const small={'/style.css':['text/css',css],'/react.js':['text/javascript',react],'/dom.js':['text/javascript',dom],'/runtime.js':['text/javascript',runtime]}[p]
      if(small){res.writeHead(200,{'Content-Type':small[0]});res.end(small[1]);return}
      if(p.startsWith('/menu-ocr/')||p.startsWith('/templates/')){
        const file=path.resolve('public','.'+p);if(!file.startsWith(path.resolve('public')+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}
        const bytes=fs.readFileSync(file),type={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.jpg':'image/jpeg','.png':'image/png','.tar':'application/octet-stream'}[path.extname(file)]||'application/octet-stream'
        if(p.startsWith('/menu-ocr/'))assets.push({path:p,bytes:bytes.length})
        res.writeHead(200,{'Content-Type':type,'Cache-Control':'public, max-age=31536000, immutable'});res.end(bytes);return
      }
      if(p!=='/owner'&&p!=='/customer'){res.writeHead(404);res.end();return}
      const mount=p==='/owner'?`React.createElement(require(${JSON.stringify(component)}).default,{menu:${JSON.stringify(menu)}})`:`React.createElement(require(${JSON.stringify(renderer)}).default,{data:${JSON.stringify(menu)}})`
      res.writeHead(200,{'Content-Type':'text/html'});res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script>${monitor}</script><script src="/react.js"></script><script src="/dom.js"></script><script src="/runtime.js"></script><script>window.appRoot=ReactDOM.createRoot(document.getElementById('root'));appRoot.render(${mount})</script></body></html>`)
    }catch(error){errors.push(error.stack);res.writeHead(500);res.end('QA server error')}
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage()
  page.on('pageerror',e=>errors.push(e.stack||e.message));const report={hardware:'Windows desktop; physical phone not tested',checks:[]}
  try{
    await page.goto(origin+'/owner');await page.getByRole('button',{name:'Scan menu photos'}).waitFor();await page.getByLabel('Menu photos',{exact:true}).setInputFiles(image)
    await page.waitForFunction(()=>!document.querySelector('.ai-menu-primary').disabled)
    assert.equal(assets.length,0);assert.equal(await page.evaluate(()=>ocrWorkers.created),0)
    report.checks.push('Opening owner importer and selecting a photo downloads no OCR assets and creates no worker')
    const start=performance.now();await page.getByRole('button',{name:'Scan menu photos'}).click();await page.getByRole('alert').waitFor({timeout:180000});assert.match(await page.getByRole('alert').innerText(),/Temporary draft save failure/)
    report.firstScanSeconds=(performance.now()-start)/1000;report.firstTransferMiB=assets.reduce((n,a)=>n+a.bytes,0)/1024/1024;report.firstAssets=[...assets];report.workerResponsiveness=await page.evaluate(()=>ocrWorkers)
    assert.equal(report.workerResponsiveness.active,0);assert.ok(report.workerResponsiveness.beats>10);assert.equal(posts.length,1);assert.equal(posts[0].body.action,'ocr');assert.equal(posts[0].type,'application/json');assert.ok(posts[0].bytes<256000)
    fs.writeFileSync(path.join(output,'observations.json'),JSON.stringify(posts[0].body.observations,null,2))
    fs.writeFileSync(path.join(output,'draft.json'),JSON.stringify(loadServer('lib/menu-ocr.ts').draftFromOcr(posts[0].body.observations),null,2))
    const workerCount=report.workerResponsiveness.created,assetCount=assets.length,retry=performance.now()
    await page.getByRole('button',{name:'Scan menu photos'}).click();await page.getByRole('heading',{name:reviewHeading}).waitFor({timeout:10000})
    report.saveRetrySeconds=(performance.now()-retry)/1000;assert.equal(await page.evaluate(()=>ocrWorkers.created),workerCount);assert.equal(assets.length,assetCount)
    assert.deepEqual(posts[0].body.observations,posts[1].body.observations)
    await page.getByLabel('Items per page').selectOption('100')
    const actual=await page.locator('.ai-menu-draft').evaluateAll(rows=>rows.flatMap(row=>{const name=row.querySelector('[aria-label="Dish name"]').value,category=row.dataset.category;return [...row.querySelectorAll('input[data-menu-price][data-item-index]')].map(input=>({name:input.dataset.menuPrice==='single'?name:`${name} (${input.dataset.menuPrice})`,category,price:input.value===''?null:Number(input.value)}))}))
    const normalize=rows=>rows.map(({category,name,price})=>({category,name:name.toLowerCase(),price})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
    // Known reading mistakes remain visible and are reported against the human
    // transcription. This allowance tests layout handling, never rewrites the app's OCR.
    const expectedReadings=expected.rows.map(row=>{const finding=expected.reviewFindings?.find(f=>f.name===row.name);return {...row,name:finding?.observedName||row.name,price:finding?.unconfirmedPrice?null:row.price}})
    assert.deepEqual(normalize(actual),normalize(expectedReadings))
    report.accuracy={rows:actual.length,exactNamePricePairs:actual.filter(a=>expected.rows.some(e=>e.category===a.category&&e.name.toLowerCase()===a.name.toLowerCase()&&e.price===a.price)).length,unconfirmedPrices:actual.filter(a=>a.price===null).length,readingMistakes:expected.reviewFindings||[]}
    assert.equal(await page.locator('.basic-menu-dish').count(),dishCount,'Portions belong under one dish; unconfirmed prices must stay visible')
    assert.equal(await page.locator('.basic-menu-price-unconfirmed').count(),report.accuracy.unconfirmedPrices)
    assert.equal(await page.getByLabel('Menu currency',{exact:true}).inputValue(),'');for(const label of await page.getByLabel('Dietary label',{exact:true}).all())assert.equal(await label.inputValue(),'')
    await page.getByRole('button',{name:'View in original photo'}).first().click();assert.equal(await page.getByLabel('Highlighted original row').count(),1)
    await page.screenshot({path:path.join(output,'source-review.png'),fullPage:true})
    report.checks.push(`Actual OCR retained ${expected.rows.length} rows in their sections; ${report.accuracy.exactNamePricePairs} exact name/price pairs; ${report.accuracy.unconfirmedPrices} prices need confirmation; each row links to source coordinates`)
    report.checks.push('A failed save retries cached text without another worker, download or image upload')
    if(expected.exerciseOwnerReview){
      await page.getByRole('button',{name:'Live menu',exact:true}).click()
      const rows=page.locator('.ai-menu-draft');await page.getByLabel('Menu currency',{exact:true}).selectOption('INR')
      const groupedActual=groupMenuPortions(actual,row=>row.category)
      for(let i=0;i<groupedActual.length;i++){
        const group=groupedActual[i],observed=group.entries[0].item,finding=expected.reviewFindings?.find(f=>f.observedName===observed.name),source=expected.rows.find(e=>e.category===observed.category&&e.name===(finding?.name||observed.name))
        assert.ok(source,'Owner correction must reference the separate human transcription')
        if(await rows.nth(i).locator('.studio-row-toggle').getAttribute('aria-expanded')!=='true')await rows.nth(i).locator('.studio-row-toggle').click()
        await rows.nth(i).getByLabel('Dish name',{exact:true}).fill(readPortionName(source.name).name)
        for(const entry of group.entries){
          const old=entry.item,review=expected.reviewFindings?.find(f=>f.observedName===old.name),value=expected.rows.find(e=>e.category===old.category&&e.name===(review?.name||old.name))
          assert.ok(value);await rows.nth(i).locator(`input[data-menu-price="${entry.portion||'single'}"]`).fill(String(value.price))
        }
        // Simulated owner input in the isolated test DB, not inferred dietary truth.
        await rows.nth(i).getByLabel('Dietary label',{exact:true}).selectOption(/chicken|murg/i.test(group.name)?'nonveg':'veg')
      }
      await page.locator('.studio-steps button').last().click();await page.getByLabel('I checked every dish',{exact:false}).check();await page.getByRole('button',{name:'Publish reviewed dishes'}).click()
      await page.getByRole('status').filter({hasText:`Published ${dishCount} dishes`}).waitFor()
      await db.db.exec('reset role');assert.equal((await db.db.query('select count(*) n from dishes')).rows[0].n,expected.rows.length)
      assert.equal((await db.db.query('select count(*) n from categories')).rows[0].n,expected.headings.length)
      report.checks.push('Owner corrects the recorded OCR errors, confirms the missing price/currency/labels, and publishes every size option through the actual SQL transaction')
    }else await page.getByRole('button',{name:'Discard draft'}).click()
    await page.getByRole('heading',{name:'1. Upload menu photos'}).waitFor();await page.getByLabel('Menu photos',{exact:true}).setInputFiles(image)
    const cachedAssets=assets.length,cachedStart=performance.now();await page.getByRole('button',{name:'Scan menu photos'}).click();await page.getByRole('heading',{name:reviewHeading}).waitFor({timeout:180000})
    report.cachedScanSeconds=(performance.now()-cachedStart)/1000;report.cachedNetwork=assets.slice(cachedAssets);report.cacheKeys=await page.evaluate(async()=>{const cache=await caches.open('wiit-menu-ocr-0.4.2');return (await cache.keys()).map(r=>r.url)});assert.equal(report.cachedNetwork.filter(a=>a.bytes>50000).length,0,JSON.stringify(report));assert.equal(await page.evaluate(()=>ocrWorkers.active),0)
    report.checks.push('A subsequent scan creates a fresh worker but reuses cached large runtime/model files; worker terminates after each scan')
    await page.getByRole('button',{name:'Discard draft'}).click();await page.getByRole('heading',{name:'1. Upload menu photos'}).waitFor();await page.getByLabel('Menu photos',{exact:true}).setInputFiles(image)
    const saved=posts.length;await page.getByRole('button',{name:'Scan menu photos'}).click();await page.waitForFunction(()=>ocrWorkers.active===1);await page.getByRole('button',{name:'Cancel scan'}).click();await page.getByRole('status').filter({hasText:'Scan cancelled'}).waitFor();assert.equal(await page.evaluate(()=>ocrWorkers.active),0);assert.equal(posts.length,saved)
    await page.getByRole('button',{name:'Scan menu photos'}).click();await page.waitForFunction(()=>ocrWorkers.active===1);await page.evaluate(()=>appRoot.unmount());await page.waitForFunction(()=>ocrWorkers.active===0);assert.equal(posts.length,saved)
    report.checks.push('Cancel and leaving the editor terminate the worker and do not save a partial scan')
    const publicBefore=assets.length;await page.goto(origin+'/customer');await page.locator('.basic-menu').waitFor();assert.equal(assets.length,publicBefore);assert.equal(await page.evaluate(()=>ocrWorkers.created),0)
    assert.equal(providerCalls,0);assert.deepEqual(errors,[]);report.checks.push('Customer renderer downloads no OCR files and never calls a provider')
    report.jsonUploadBytes=posts[0].bytes;report.providerCalls=providerCalls;report.passed=true
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
  }catch(error){console.error('OCR QA state',JSON.stringify({assets,posts:posts.map(p=>({type:p.type,bytes:p.bytes})),errors,ui:(await page.locator('body').innerText().catch(()=>'')).slice(0,1000),workers:await page.evaluate(()=>ocrWorkers).catch(()=>null)}));await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error}
  finally{await browser.close();await new Promise(resolve=>server.close(resolve));await db.db.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
