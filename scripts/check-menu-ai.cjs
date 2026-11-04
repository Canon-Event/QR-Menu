// Development probe. Never prints the API key or full upstream response bodies.
const {loadEnvConfig}=require('@next/env'),fs=require('node:fs')
loadEnvConfig(process.cwd())
async function main(){
  const key=process.env.GEMINI_API_KEY,model=process.env.GEMINI_MENU_MODEL||'gemini-3.5-flash-lite'
  if(!key||!/^gemini-[a-z0-9.-]{1,80}$/.test(model)){console.log('Configure GEMINI_API_KEY and GEMINI_MENU_MODEL first.');process.exitCode=1;return}
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}`,{headers:{'x-goog-api-key':key},redirect:'error',signal:AbortSignal.timeout(15000)})
  console.log(JSON.stringify({check:'model access',model,http_status:response.status}))
  await response.body?.cancel()
  if(!response.ok){console.log('Google rejected model access. Check the key, project permissions and model in AI Studio.');process.exitCode=1;return}
  const photo=process.argv[2]
  if(photo){
    const originalFetch=global.fetch
    global.fetch=async(...args)=>{
      const result=await originalFetch(...args)
      if(!result.ok){
        const body=await result.clone().json().catch(()=>({})),message=String(body.error?.message||'').toLowerCase()
        const category=message.includes('leaked')?'leaked key':message.includes('api key not valid')?'invalid key':message.includes('schema')?'schema configuration':message.includes('billing')?'billing/project access':message.includes('permission')?'project permissions':message.includes('not found')?'model unavailable':'provider rejection'
        const status=/^[A-Z_]{1,50}$/.test(body.error?.status||'')?body.error.status:undefined
        const reasons=(body.error?.details||[]).map(d=>d.reason).filter(r=>typeof r==='string'&&/^[A-Z_]{1,60}$/.test(r))
        console.log(JSON.stringify({check:'provider diagnostic',http_status:result.status,status,category,reasons}))
        if(process.argv.includes('--diagnostic')) console.log(JSON.stringify({sanitized_message:String(body.error?.message||'').split(key).join('[redacted]').replace(/[A-Za-z0-9_.-]{25,}/g,'[redacted-token]').slice(0,1000)}))
      }
      return result
    }
    const {loadServer}=require('../tests/helpers/load-server.cjs'),server=loadServer('lib/ai-menu-server.ts',{},process.env)
    const bytes=fs.readFileSync(photo),info=server.inspectMenuImage(bytes,photo.toLowerCase().endsWith('.png')?'image/png':'image/jpeg')
    const draft=await server.extractMenu([{bytes,mime:info.mime}])
    console.log(JSON.stringify({check:'image extraction',dishes:draft.items.length,currency:draft.currency,unconfirmed_prices:draft.items.filter(i=>i.price===null).length}))
    if(process.argv.includes('--synthetic')){
      const expected=[['lassi',90,true],['lemon soda',60,true],['chicken curry',220,false]]
      if(draft.currency!=='INR'||draft.items.length!==3||!expected.every(([name,price,veg])=>draft.items.some(i=>i.name.toLowerCase().includes(name)&&i.price===price&&i.isVeg===veg)))throw new Error('Synthetic sample mismatch')
      console.log('Synthetic sample: all 3 names, prices, currency and explicit dietary labels matched.')
    }
  }
}
main().catch(error=>{
  if(typeof error.status==='number') console.log(JSON.stringify({check:'image extraction',status:error.status,error:error.message}))
  else console.log('The Gemini check could not complete. Check network access and AI Studio configuration. No secrets or provider bodies were printed.')
  process.exitCode=1
})
