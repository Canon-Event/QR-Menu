// Build-time preparation only. No Paddle/OpenCV/ONNX imports enter Next's page bundles.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),version='0.4.2',runtime=path.join(root,'public/menu-ocr/paddle-'+version)
const cache=path.join(root,'node_modules/.cache/paddleocr-benchmark/node_modules')
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
function packageRoot(name){
  const direct=path.join(root,'node_modules',name),fallback=path.join(cache,name)
  const location=[direct,fallback].find(p=>fs.existsSync(path.join(p,'package.json')))
  if(!location)throw new Error(`Install the pinned ${name} dev dependency before preparing OCR.`)
  return location
}
async function main(){
  const sdk=packageRoot('@paddleocr/paddleocr-js'),ort=packageRoot('onnxruntime-web')
  if(JSON.parse(fs.readFileSync(path.join(sdk,'package.json'))).version!==version||JSON.parse(fs.readFileSync(path.join(ort,'package.json'))).version!=='1.24.3')throw new Error('OCR SDK/runtime versions must be 0.4.2 / 1.24.3.')
  fs.mkdirSync(runtime,{recursive:true})
  const entry=fs.readFileSync(path.join(sdk,'dist/index.mjs'),'utf8'),worker=entry.match(/new URL\("\.\/assets\/(worker-entry-[^"]+\.js)"/)
  if(!worker)throw new Error('Pinned OCR worker entry was not found.')
  const files=[]
  function copy(from,name){const bytes=fs.readFileSync(from);const target=path.join(runtime,name);if(!fs.existsSync(target)||sha(fs.readFileSync(target))!==sha(bytes))fs.writeFileSync(target,bytes);files.push({name,bytes:bytes.length,sha256:sha(bytes)})}
  copy(path.join(sdk,'dist/assets',worker[1]),'vendor-worker.js')
  // The published worker embeds ORT's JSEP build, even when its provider is WASM.
  for(const name of ['ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm'])copy(path.join(ort,'dist',name),name)
  for(const unused of ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])fs.rmSync(path.join(runtime,unused),{force:true})
  // npm omits these notices; ship the upstream copies alongside the vendor bundle.
  for(const name of ['PADDLE-LICENSE.txt','ONNX-LICENSE.txt','OPENCV-LICENSE.txt'])copy(path.join(root,'scripts/ocr-licenses',name),name)
  let previous
  try{previous=JSON.parse(fs.readFileSync(path.join(runtime,'manifest.json'),'utf8'))}catch{}
  const assets={}
  for(const [role,model] of [['det','PP-OCRv6_small_det'],['rec','PP-OCRv6_small_rec']]){
    const name=model+'.tar',target=path.join(runtime,name),old=previous?.files?.find(f=>f.name===name)
    if(!fs.existsSync(target)||!old||sha(fs.readFileSync(target))!==old.sha256){
      console.log('Preparing OCR model:',model)
      const response=await fetch(`https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/${model}_onnx_infer.tar`,{signal:AbortSignal.timeout(120000),redirect:'error'})
      if(!response.ok)throw new Error(`OCR model download failed (${response.status}).`)
      const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length<100000||bytes.length>40000000)throw new Error('Unexpected OCR model size.')
      fs.writeFileSync(target,bytes)
    }
    const bytes=fs.readFileSync(target);files.push({name,bytes:bytes.length,sha256:sha(bytes)});assets[role]={url:`/menu-ocr/paddle-${version}/${name}`}
  }
  const {normalizeOcrPipelineConfig}=await import(pathToFileURL(path.join(sdk,'dist/index.mjs')).href)
  const pipelineConfig=normalizeOcrPipelineConfig({pipeline_name:'OCR',SubModules:{TextDetection:{model_name:'PP-OCRv6_small_det',limit_side_len:64,limit_type:'min',max_side_limit:4000,thresh:.3,box_thresh:.6,unclip_ratio:1.5},TextRecognition:{model_name:'PP-OCRv6_small_rec',batch_size:6,score_thresh:0}}})
  pipelineConfig.assets=assets
  const options={pipelineConfig,ortOptions:{backend:'wasm',numThreads:1,simd:true,wasmPaths:`/menu-ocr/paddle-${version}/`,disableWasmProxy:true}}
  fs.writeFileSync(path.join(runtime,'config.json'),JSON.stringify(options))
  fs.writeFileSync(path.join(runtime,'manifest.json'),JSON.stringify({sdk:version,ort:'1.24.3',files},null,2))
  console.log(`OCR assets ready: ${(files.reduce((n,f)=>n+f.bytes,0)/1024**2).toFixed(1)} MiB, loaded only when scanning.`)
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
