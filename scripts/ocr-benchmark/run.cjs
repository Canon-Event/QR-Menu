// Isolated runtime: npm dependencies live in ignored node_modules/.cache.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url'),{execFileSync}=require('node:child_process')
const {evaluate}=require('./evaluate.cjs')
const root=path.resolve(__dirname),workspace=path.resolve(root,'../..'),toolsRoot=path.join(workspace,'node_modules/.cache/paddleocr-benchmark')
const output=path.join(workspace,'artifacts/ai-menu-qa/paddleocr'),expected=require('./expected-borcelle.json')
const imageFile=path.resolve(process.env.OCR_IMAGE||path.join(output,'borcelle-canva-1131.jpg'))
const upscale=Number(process.env.OCR_UPSCALE||1),suffix=upscale>1?`-upscale${upscale}`:''
const reportFile=path.join(output,`results${suffix}.json`)
async function timed(promise,label,ms=120000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out after ${ms/1000}s`)),ms)})])}finally{clearTimeout(timer)}}
async function browserMemory(browser) {
  if(process.platform!=='win32')return null
  try {
    const session=await browser.newBrowserCDPSession(),{processInfo}=await session.send('SystemInfo.getProcessInfo');await session.detach()
    const ids=processInfo.map(p=>Number(p.id)).filter(Number.isInteger)
    return Number(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | Measure-Object -Property WorkingSet64 -Sum).Sum`],{encoding:'utf8',windowsHide:true}).trim())
  }catch{return null}
}
async function main(){
  fs.mkdirSync(output,{recursive:true});if(!fs.existsSync(imageFile))throw new Error('Set OCR_IMAGE to the original menu file path.')
  const {createServer}=await import(pathToFileURL(path.join(toolsRoot,'node_modules/vite/dist/node/index.js')).href)
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(workspace,'node_modules/.cache/wiit-pos-tools/node_modules/playwright'))
  const sdk=path.join(toolsRoot,'node_modules/@paddleocr/paddleocr-js/dist/index.mjs'),ort=path.join(toolsRoot,'node_modules/onnxruntime-web/dist')
  const commonjs=['clipper-lib','@techstark/opencv-js']
  const alias=Object.fromEntries(commonjs.map(name=>[name,require.resolve(name,{paths:[toolsRoot]})]));alias['@paddleocr/paddleocr-js']=sdk
  const server=await createServer({root,configFile:false,cacheDir:path.join(toolsRoot,'.vite'),optimizeDeps:{exclude:['@paddleocr/paddleocr-js'],include:commonjs},logLevel:'warn',resolve:{alias},server:{host:'127.0.0.1',port:0,fs:{allow:[workspace]}},plugins:[{name:'benchmark-files',configureServer(s){s.middlewares.use((req,res,next)=>{
    let file;if(req.url==='/source-image')file=imageFile;else if(req.url?.startsWith('/ort/')){const name=path.basename(req.url.split('?')[0]);file=path.join(ort,name)}
    if(!file)return next();if(!fs.existsSync(file)){res.statusCode=404;res.end();return}
    res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.mjs')?'text/javascript':file.endsWith('.png')?'image/png':'image/jpeg');fs.createReadStream(file).pipe(res)
  })}}]})
  await server.listen();const address=server.httpServer.address(),url=`http://127.0.0.1:${address.port}`
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'C:/Users/Saksham/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'})
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],network=[]
  page.on('pageerror',e=>{errors.push(e.message);console.log('page error:',e.message.slice(0,300))});page.on('console',m=>{if(m.type()==='error')console.log('browser:',m.text().slice(0,250))})
  context.on('requestfailed',request=>console.log('request failed:',request.url().slice(0,180),request.failure()?.errorText))
  context.on('requestfinished',async req=>{try{const sizes=await req.sizes();network.push({url:req.url(),method:req.method(),bytes:sizes.responseBodySize})}catch{}})
  const report={image:path.basename(imageFile),imageSha256:crypto.createHash('sha256').update(fs.readFileSync(imageFile)).digest('hex'),source:expected.source,hardware:{platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,totalMemoryBytes:os.totalmem()},sdkVersion:require(path.join(toolsRoot,'node_modules/@paddleocr/paddleocr-js/package.json')).version,backend:'single-thread WASM worker',runs:[],errors}
  try{
    const loadStart=Date.now();await page.goto(url);await page.waitForFunction(()=>window.benchmark,{},{timeout:60000})
    report.runtimeLoadMs=Date.now()-loadStart;report.runtimeLoadBytes=network.reduce((sum,n)=>sum+n.bytes,0)
    report.baselineBrowserWorkingSetBytes=await browserMemory(browser)
    const models=process.env.OCR_MODEL?[process.env.OCR_MODEL]:['PP-OCRv6','PP-OCRv5']
    for(const model of models){
      console.log(`Initializing ${model}…`)
      const before=network.length,init=await timed(page.evaluate(model=>window.benchmark.initialize(model),model),'Model initialization')
      console.log(`${model} initialized in ${(init.initMs/1000).toFixed(2)}s`)
      const memoryAfterInit=await browserMemory(browser)
      for(const width of upscale>1?[566]:[1131,566]){
        const trials=[]
        for(let repetition=0;repetition<3;repetition++){
          const result=await timed(page.evaluate(({width,upscale})=>window.benchmark.recognize(width,upscale,width===566?800:undefined),{width,upscale}),'Recognition')
          trials.push(result.wallMs)
          if(repetition===0){
            const assessed=evaluate(result.items,expected),run={model,width,height:result.image.height,initMs:init.initMs,memoryAfterInit,summary:init.summary,raw:result,assessment:assessed}
            report.runs.push(run);console.log(JSON.stringify({model,width,lines:result.items.length,namePricePairs:assessed.correctNamePricePairs,categories:assessed.expectedHeadingsRead,wallMs:Math.round(result.wallMs)}))
            await page.screenshot({path:path.join(output,`${model}-${width}${suffix}.png`),fullPage:true})
          }
        }
        const run=report.runs.at(-1);run.trialMs=trials;run.browserWorkingSetBytes=await browserMemory(browser)
      }
      // A viewport change cannot establish real phone CPU, memory or download performance.
      await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,`${model}-phone-viewport-only${suffix}.png`),fullPage:true});await page.setViewportSize({width:1440,height:1000})
      report.physicalPhoneTest='Not performed. Phone viewport screenshots use this desktop CPU.'
      report.runs.filter(r=>r.model===model).forEach(r=>r.initializationRequestBytes=network.slice(before).filter(n=>!n.url.includes('/source-image')).reduce((sum,n)=>sum+n.bytes,0))
      await page.evaluate(()=>window.benchmark.dispose());fs.writeFileSync(reportFile,JSON.stringify(report,null,2))
    }
  }catch(error){report.failure=error.message;console.error(error.message);process.exitCode=1}
  finally{report.network=network;fs.writeFileSync(reportFile,JSON.stringify(report,null,2));await browser.close();await server.close()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
