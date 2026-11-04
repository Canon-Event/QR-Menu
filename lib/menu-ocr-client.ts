// Imported only after the owner presses Scan. No OCR package is imported into this module.
import { AI_MENU_MAX_BYTES } from './ai-menu'
import { MENU_OCR_VERSION, parseOcrUpload, type OcrPage, type OcrUpload } from './menu-ocr'

const runtime = '/menu-ocr/paddle-0.4.2/'
function photoSize(bytes: Uint8Array) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
  if(bytes.length>=33&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return {width:view.getUint32(16),height:view.getUint32(20),mime:'image/png'}
  if(bytes.length>4&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217){
    let offset=2
    while(offset+4<bytes.length){
      if(bytes[offset++]!==255)break
      while(bytes[offset]===255)offset++
      const marker=bytes[offset++];if(marker===218||marker===217)break
      const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)break
      if([192,193,194].includes(marker)&&length>=8)return {width:view.getUint16(offset+5),height:view.getUint16(offset+3),mime:'image/jpeg'}
      offset+=length
    }
  }
  throw new Error('Choose a valid PNG or JPEG menu photo.')
}

export async function readMenuOnDevice(files: File[], { signal, onProgress }: {signal: AbortSignal; onProgress: (message: string)=>void}): Promise<OcrUpload> {
  if(!files.length||files.length>3||files.reduce((n,f)=>n+f.size,0)>AI_MENU_MAX_BYTES)throw new Error('Choose up to three menu photos totalling 3 MB or less.')
  if(typeof Worker==='undefined'||typeof createImageBitmap!=='function'||!crypto.subtle)throw new Error('This browser cannot run the local text reader. Try an up-to-date browser or choose the online reader.')
  signal.throwIfAborted()
  const imageHashes:string[]=[]
  for(const file of files){
    const bytes=await file.arrayBuffer(),size=photoSize(new Uint8Array(bytes))
    if(size.mime!==file.type||size.width<64||size.height<64||size.width>8000||size.height>8000||size.width*size.height>20_000_000)throw new Error('Use a clear PNG/JPEG between 64 and 8,000 pixels per side, up to 20 megapixels.')
    imageHashes.push([...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join(''))
  }
  onProgress('Loading the text reader… First-use files are saved for future scans.')
  const response=await fetch(runtime+'config.json',{signal,cache:'force-cache'})
  if(!response.ok)throw new Error('Text reader files are unavailable. Refresh after the deployment finishes, or choose the online reader.')
  const options=await response.json()
  options.ortOptions.wasmPaths=new URL(options.ortOptions.wasmPaths,location.origin).href
  for(const asset of Object.values(options.pipelineConfig.assets) as {url:string}[])asset.url=new URL(asset.url,location.origin).href
  signal.throwIfAborted()
  const worker=new Worker('/menu-ocr/loader-v1.js',{type:'module',name:'wiit-menu-reader'})
  let nextId=1,readyResolve:()=>void=()=>{},readyReject:(reason:unknown)=>void=()=>{}
  const pending=new Map<number,{resolve:(value:any)=>void;reject:(reason:unknown)=>void;timer:ReturnType<typeof setTimeout>}>()
  const ready=new Promise<void>((resolve,reject)=>{readyResolve=resolve;readyReject=reject})
  const stop=(reason:unknown)=>{worker.terminate();readyReject(reason);for(const request of pending.values()){clearTimeout(request.timer);request.reject(reason)}pending.clear()}
  const abort=()=>stop(new DOMException('Scan cancelled.','AbortError'))
  signal.addEventListener('abort',abort,{once:true})
  worker.onmessage=event=>{
    const message=event.data
    if(message?.kind==='menu-ocr-ready'){readyResolve();return}
    if(message?.kind==='menu-ocr-loader-error'){stop(new Error(message.message));return}
    if(message?.kind!=='worker-transport-response')return
    const request=pending.get(message.requestId);if(!request)return
    clearTimeout(request.timer);pending.delete(message.requestId)
    if(message.status==='success')request.resolve(message.payload)
    else request.reject(new Error('The text reader could not finish this page. Try a closer photo of one menu section.'))
  }
  worker.onerror=()=>stop(new Error('The text reader stopped. Try fewer pages, a smaller photo, or the online reader.'))
  const request=(type:string,payload:unknown,transfer:Transferable[]=[])=>new Promise<any>((resolve,reject)=>{
    const requestId=nextId++,timer=setTimeout(()=>stop(new Error('Reading took too long. Try one clear menu section at a time.')),120000)
    pending.set(requestId,{resolve,reject,timer});try{worker.postMessage({kind:'worker-transport-request',type,payload,requestId},transfer)}catch(error){clearTimeout(timer);pending.delete(requestId);reject(error)}
  })
  const bootTimer=setTimeout(()=>stop(new Error('The text reader could not load. Check your connection and try again.')),90000)
  try {
    await ready;clearTimeout(bootTimer);signal.throwIfAborted()
    await request('init',{options})
    const pages:OcrPage[]=[]
    for(let index=0;index<files.length;index++){
      signal.throwIfAborted();onProgress(`Reading page ${index+1} of ${files.length}… You can keep using the dashboard.`)
      let bitmap=await createImageBitmap(files[index])
      const {width,height}=bitmap,scale=Math.min(1,2400/Math.max(width,height),Math.sqrt(4_000_000/(width*height)))
      if(scale<1){const original=bitmap;try{bitmap=await createImageBitmap(original,{resizeWidth:Math.max(1,Math.round(width*scale)),resizeHeight:Math.max(1,Math.round(height*scale)),resizeQuality:'high'})}finally{original.close()}}
      if(signal.aborted){bitmap.close();signal.throwIfAborted()}
      const [result]=await request('predict',{sources:[{kind:'imageBitmap',imageBitmap:bitmap}],params:{}},[bitmap])
      pages.push({width:result.image.width,height:result.image.height,items:result.items})
    }
    signal.throwIfAborted()
    return parseOcrUpload({version:MENU_OCR_VERSION,imageHashes,pages})
  } finally {
    clearTimeout(bootTimer);signal.removeEventListener('abort',abort)
    // Release model/WASM memory immediately; retries reuse text, not a live worker.
    worker.terminate();for(const entry of pending.values())clearTimeout(entry.timer);pending.clear()
  }
}
