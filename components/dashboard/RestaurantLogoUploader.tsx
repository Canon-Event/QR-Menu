'use client'

import { FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

export default function RestaurantLogoUploader({ initialUrl, restaurantName }: { initialUrl?: string; restaurantName: string }) {
  const router = useRouter()
  const [target, setTarget] = useState<Element | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState(initialUrl || '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { const find = () => setTarget(document.querySelector('.settings-card .settings-form-grid')); find(); const observer = new MutationObserver(find); observer.observe(document.body, { childList: true, subtree: true }); return () => observer.disconnect() }, [])
  useEffect(() => () => { if (preview.startsWith('blob:')) URL.revokeObjectURL(preview) }, [preview])
  function choose(next: File | null) { setFile(next); setMessage(''); if (next) setPreview(URL.createObjectURL(next)) }
  async function upload(event: FormEvent) { event.preventDefault(); if (!file) return; setBusy(true); setMessage(''); const body = new FormData(); body.set('logo', file); const response = await fetch('/api/settings/logo', { method: 'POST', body }); const result = await response.json().catch(() => ({})); setBusy(false); if (!response.ok) return setMessage(result.error || 'Could not upload logo.'); setPreview(result.logoUrl); setFile(null); setMessage('Logo uploaded successfully.'); router.refresh() }
  if (!target) return null
  return createPortal(<div className="restaurant-logo-upload full"><div className="restaurant-logo-preview">{preview ? <img src={preview} alt={`${restaurantName} logo preview`} /> : <span>{restaurantName.slice(0,1).toUpperCase()}</span>}</div><form onSubmit={upload}><label>Upload restaurant logo <span>JPG, PNG or WebP · maximum 2 MB</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => choose(event.target.files?.[0] || null)} /></label><button disabled={!file || busy}>{busy ? 'Uploading…' : 'Upload logo'}</button>{message && <small role="status">{message}</small>}</form></div>, target)
}
