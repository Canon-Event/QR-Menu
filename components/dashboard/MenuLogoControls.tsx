'use client'

import { useState } from 'react'

type Props={url:string;restaurantName:string;onChange:(url:string)=>void;onError:(message:string)=>void;onUploading:(busy:boolean)=>void}

export default function MenuLogoControls({url,restaurantName,onChange,onError,onUploading}:Props){
  const [busy,setBusy]=useState(''),[notice,setNotice]=useState('')
  async function upload(file?:File){
    if(!file)return
    onError('');setNotice('')
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024){onError('Choose a JPG, PNG or WebP logo under 2 MB.');return}
    setBusy('upload');onUploading(true)
    try{
      const image=await createImageBitmap(file),scale=Math.min(1,512/Math.max(image.width,image.height)),canvas=document.createElement('canvas')
      canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale))
      try{const context=canvas.getContext('2d');if(!context)throw new Error('Could not prepare this logo. Try another image.');context.drawImage(image,0,0,canvas.width,canvas.height)}finally{image.close()}
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',.92))
      if(!blob)throw new Error('Could not prepare this logo. Try another image.')
      const form=new FormData();form.set('logo',blob,'restaurant-logo.webp')
      const response=await fetch('/api/settings/logo',{method:'POST',body:form}),result=await response.json().catch(()=>({}))
      if(!response.ok||!result.logoUrl)throw new Error(result.error||'Could not upload the logo. Please try again.')
      onChange(result.logoUrl);setNotice('Logo saved to your menu.')
    }catch(error){onError(error instanceof Error?error.message:'Could not upload the logo. Please try again.')}
    finally{setBusy('');onUploading(false)}
  }
  async function remove(){
    setBusy('remove');onUploading(true);onError('');setNotice('')
    try{
      const response=await fetch('/api/settings/logo',{method:'DELETE',headers:{'Content-Type':'application/json'},body:'{}'}),result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error||'Could not remove the logo. Please try again.')
      onChange('');setNotice('Logo removed.')
    }catch(error){onError(error instanceof Error?error.message:'Could not remove the logo. Please try again.')}
    finally{setBusy('');onUploading(false)}
  }
  return <div className="ai-logo-controls" id="ai-menu-logo-controls">
    <div className="ai-logo-thumbnail">{url?<img src={url} alt={`${restaurantName} logo preview`} width="64" height="64"/>:<span aria-hidden="true">✳</span>}</div>
    <div className="ai-logo-content"><b>Restaurant logo</b><p>Replace the star beside your restaurant name.</p><div className="ai-logo-actions"><button type="button" disabled={!!busy} onClick={()=>document.getElementById('ai-menu-logo-input')?.click()}>{busy==='upload'?'Uploading logo…':url?'Change logo':'Upload logo'}</button>{url&&<button type="button" disabled={!!busy} onClick={()=>void remove()}>{busy==='remove'?'Removing…':'Remove logo'}</button>}</div><input id="ai-menu-logo-input" className="ai-logo-file-input" tabIndex={-1} aria-label="Upload restaurant logo" type="file" accept="image/jpeg,image/png,image/webp" disabled={!!busy} onChange={event=>{void upload(event.target.files?.[0]);event.target.value=''}}/><small>PNG, JPG or WebP · up to 2 MB. Transparency is preserved. Saves immediately.</small>{notice&&<p className="ai-logo-notice" role="status">{notice}</p>}</div>
  </div>
}
