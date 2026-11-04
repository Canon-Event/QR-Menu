'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardTemplatePreview from './DashboardTemplatePreview'

const templates = [
  { id: 'A', name: 'Heritage', description: 'Warm parchment, traditional illustrations and a classic Indian menu.' },
  { id: 'B', name: 'Green Bistro', description: 'Botanical details, food photography and considered editorial layouts.' },
  { id: 'C', name: 'Italian', description: 'Antique florals, expressive serif headings and a romantic table.' },
  { id: 'D', name: 'Bloom & Brunch', description: 'Watercolor citrus, handwritten headings and a relaxed café spirit.' },
]

export default function MenuTemplateGallery({ restaurant }: { restaurant: { name: string; slug: string; template: string; template_settings?: unknown } }) {
  const router = useRouter()
  const [active, setActive] = useState(restaurant.template)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!preview) { dialog.current?.close(); return }
    dialog.current?.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [preview])
  async function applyTemplate(id: string) {
    setBusy(id); setMessage(''); setError('')
    try {
      const response = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'template', template: id }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Could not apply template. Please try again.')
      setActive(id); setMessage(`${templates.find(item => item.id === id)?.name} is now live.`); router.refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Connection lost. Please try again.') }
    finally { setBusy('') }
  }
  return <main className="templates-page menu-gallery">
    <header className="templates-page-header"><div><a href="/dashboard">← Dashboard</a><p>MENU DESIGN</p><h1>Find your restaurant’s style</h1><span>Your real menu, in four distinct designs. Customize a look before making it live.</span></div><a className="templates-active-menu" href={`/menu/${restaurant.slug}`} target="_blank" rel="noopener noreferrer">View active menu ↗</a></header>
    {message && <p className="templates-message" role="status">{message}</p>}{error && <p className="templates-message" role="alert">{error}</p>}
    <section className="templates-gallery">{templates.map(item => <article className={`template-gallery-card ${active === item.id ? 'active' : ''}`} key={item.id}><button className="mg-cover" onClick={() => setPreview(item.id)} aria-label={`Preview ${item.name}`}><DashboardTemplatePreview template={item.id} name={item.name} /><span>Explore design ↗</span></button><div className="template-gallery-copy"><div><h2>{item.name}</h2>{active === item.id && <em>In use</em>}</div><p>{item.description}</p><footer className="template-card-actions"><button onClick={() => setPreview(item.id)}>Preview</button><a href={`/dashboard/templates/${item.id}/edit`}>Customize</a><button className="template-apply-button" disabled={Boolean(busy) || active === item.id} onClick={() => applyTemplate(item.id)}>{busy === item.id ? 'Applying…' : active === item.id ? 'In use' : 'Use'}</button></footer></div></article>)}</section>
    <dialog ref={dialog} className="mg-preview" aria-labelledby="mg-preview-title" onClose={() => setPreview(null)} onClick={event => { if (event.target === event.currentTarget) setPreview(null) }}>
      <div className="mg-preview-panel"><header><h2 id="mg-preview-title">{templates.find(item => item.id === preview)?.name}</h2><button autoFocus aria-label="Close preview" onClick={() => setPreview(null)}>×</button></header><div className="mg-preview-frame">{preview && <iframe title={`${templates.find(item => item.id === preview)?.name} full menu preview`} src={`/dashboard/menu-preview?template=${preview}&embedded=1`} />}</div>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}<footer><a href={`/dashboard/templates/${preview}/edit`}>Customize design</a><button disabled={Boolean(busy) || active === preview} onClick={() => preview && applyTemplate(preview)}>{busy ? 'Applying…' : active === preview ? 'Currently live' : 'Use this template'}</button></footer></div>
    </dialog>
  </main>
}
