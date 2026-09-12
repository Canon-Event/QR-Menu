'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { googleFontStylesheetUrl, menuDesignVariables } from '@/lib/menu-fonts'

type Design = {
  font: string
  primaryColor: string
  imageUrl: string
  restaurantNameSize: number
  subtitleSize: number
  menuTitleSize: number
  categorySize: number
  dishNameSize: number
  descriptionSize: number
  priceSize: number
  addressSize: number
}
type SizeKey = Exclude<keyof Design, 'font' | 'primaryColor' | 'imageUrl'>
type Settings = Record<string, Partial<Design>>
type FontMeta = { family: string; category: string; variants: string[] }

const defaults: Record<string, Design> = {
  A: { font: 'serif', primaryColor: '#854d48', imageUrl: '', restaurantNameSize: 38, subtitleSize: 12, menuTitleSize: 64, categorySize: 16, dishNameSize: 14, descriptionSize: 12, priceSize: 14, addressSize: 10 },
  B: { font: 'sans', primaryColor: '#294236', imageUrl: '', restaurantNameSize: 24, subtitleSize: 12, menuTitleSize: 64, categorySize: 12, dishNameSize: 14, descriptionSize: 12, priceSize: 14, addressSize: 10 },
  C: { font: 'display', primaryColor: '#c9a65d', imageUrl: '', restaurantNameSize: 24, subtitleSize: 12, menuTitleSize: 64, categorySize: 12, dishNameSize: 14, descriptionSize: 12, priceSize: 14, addressSize: 10 },
}
const sizeControls: { key: SizeKey; label: string; min: number; max: number }[] = [
  { key: 'restaurantNameSize', label: 'Restaurant name', min: 14, max: 72 },
  { key: 'subtitleSize', label: 'Subtitle', min: 8, max: 36 },
  { key: 'menuTitleSize', label: 'MENU title', min: 24, max: 96 },
  { key: 'categorySize', label: 'Category heading', min: 10, max: 42 },
  { key: 'dishNameSize', label: 'Dish name', min: 10, max: 32 },
  { key: 'descriptionSize', label: 'Dish description', min: 8, max: 26 },
  { key: 'priceSize', label: 'Price', min: 10, max: 32 },
  { key: 'addressSize', label: 'Address', min: 8, max: 24 },
]
const templates = [
  { id: 'A', name: 'Heritage', description: 'Traditional Indian artwork, warm paper textures and elegant category pages.' },
  { id: 'B', name: 'Green Bistro', description: 'Botanical fine-dining cover, image-led inner pages and an elegant closing page.' },
  { id: 'C', name: 'Italian', description: 'Romantic Italian typography with antique botanical details.' },
]

export default function MenuTemplateGallery({ restaurant }: { restaurant: { name: string; slug: string; template: string; template_settings?: Settings } }) {
  const router = useRouter()
  const [active, setActive] = useState(restaurant.template)
  const [preview, setPreview] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>(restaurant.template_settings || {})
  const [draft, setDraft] = useState<Design>(defaults.A)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [fonts, setFonts] = useState<FontMeta[]>([])
  const [fontsBusy, setFontsBusy] = useState(false)
  const [fontsError, setFontsError] = useState('')

  useEffect(() => {
    if (!preview && !editing) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setPreview(null); setEditing(null) }
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', close)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', close) }
  }, [preview, editing])

  useEffect(() => {
    document.getElementById('google-font-editor-preview')?.remove()
    const href = googleFontStylesheetUrl(draft.font)
    if (!editing || !href) return
    const link = document.createElement('link')
    link.id = 'google-font-editor-preview'
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
    return () => link.remove()
  }, [draft.font, editing])

  async function openEditor(id: string) {
    setDraft({ ...defaults[id], ...(settings[id] || {}) })
    setEditing(id)
    if (fonts.length || fontsBusy) return
    setFontsBusy(true)
    setFontsError('')
    try {
      const response = await fetch('/api/google-fonts')
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Could not load Google Fonts.')
      setFonts(Array.isArray(result.fonts) ? result.fonts : [])
    } catch (error) {
      setFontsError(error instanceof Error ? error.message : 'Could not load Google Fonts.')
    } finally { setFontsBusy(false) }
  }

  async function applyTemplate(id: string) {
    setBusy(id)
    setMessage('')
    const response = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'template', template: id }) })
    const result = await response.json().catch(() => ({}))
    setBusy('')
    if (!response.ok) return setMessage(result.error || 'Could not apply template.')
    setActive(id)
    setMessage(`${templates.find(item => item.id === id)?.name} is now live.`)
    router.refresh()
  }

  async function saveDesign(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    setBusy('design')
    setMessage('')
    const response = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'template_customization', template: editing, ...draft }) })
    const result = await response.json().catch(() => ({}))
    setBusy('')
    if (!response.ok) return setMessage(result.error || 'Could not save design.')
    setSettings(result.restaurant.template_settings || {})
    setEditing(null)
    setMessage('Template design saved.')
    router.refresh()
  }

  return <main className="templates-page">
    <header className="templates-page-header"><div><a href="/dashboard">← Dashboard</a><p>MENU DESIGN</p><h1>Choose your menu style</h1><span>Preview and customize every design before making it live.</span></div><a className="templates-active-menu" href={`/menu/${restaurant.slug}`} target="_blank" rel="noopener noreferrer">View active menu ↗</a></header>
    {message && <div className="templates-message" role="status">{message}</div>}
    <section className="templates-gallery">{templates.map(item => <article className={`template-gallery-card ${active === item.id ? 'active' : ''}`} key={item.id}><button className={`template-gallery-image template-gallery-${item.id.toLowerCase()}`} onClick={() => setPreview(item.id)} aria-label={`Preview ${item.name}`}><span>Preview design</span></button><div className="template-gallery-copy"><div><h2>{item.name}</h2>{active === item.id && <em>Active</em>}</div><p>{item.description}</p><footer className="template-card-actions"><button onClick={() => setPreview(item.id)}>Preview</button><button onClick={() => router.push(`/dashboard/templates/${item.id}/edit`)}>Edit design</button><button className="template-apply-button" disabled={busy === item.id || active === item.id} onClick={() => applyTemplate(item.id)}>{busy === item.id ? 'Applying…' : active === item.id ? 'Active' : 'Use'}</button></footer></div></article>)}</section>
    {preview && <div className="template-preview-modal" role="dialog" aria-modal="true" onMouseDown={event => { if (event.target === event.currentTarget) setPreview(null) }}><section><header><div><small>LIVE PREVIEW</small><h2>{templates.find(item => item.id === preview)?.name}</h2></div><button onClick={() => setPreview(null)} aria-label="Close preview">×</button></header><div className="template-preview-device"><iframe title={`${preview} preview`} src={`/dashboard/menu-preview?template=${preview}&embedded=1`} /></div><footer><button onClick={() => setPreview(null)}>Close</button><button onClick={() => router.push(`/dashboard/templates/${preview}/edit`)}>Edit design</button><button className="template-apply-button" disabled={active === preview} onClick={() => applyTemplate(preview)}>{active === preview ? 'Currently active' : 'Use this template'}</button></footer></section></div>}
    {editing && <div className="template-preview-modal template-editor-modal" role="dialog" aria-modal="true" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(null) }}><form onSubmit={saveDesign}><header><div><small>DESIGN EDITOR</small><h2>Edit {templates.find(item => item.id === editing)?.name}</h2></div><button type="button" onClick={() => setEditing(null)} aria-label="Close editor">×</button></header><div className="template-editor-body">
      <label>Heading font <span>{fontsBusy ? 'Loading all Google Fonts…' : fonts.length ? `${fonts.length} Google Fonts available` : ''}</span><input list="google-font-families" value={draft.font} placeholder="Search or type a Google Font" autoComplete="off" onChange={event => setDraft({ ...draft, font: event.target.value })}/><datalist id="google-font-families"><option value="serif">Georgia Heritage</option><option value="sans">Manrope Modern</option><option value="display">DM Serif Display</option>{fonts.map(font => <option key={font.family} value={font.family}>{font.category}</option>)}</datalist>{fontsError && <small className="template-font-error">{fontsError}</small>}</label>
      <label>Primary color<div className="template-color-field"><input type="color" value={draft.primaryColor} onChange={event => setDraft({ ...draft, primaryColor: event.target.value })}/><input value={draft.primaryColor} pattern="#[0-9a-fA-F]{6}" onChange={event => setDraft({ ...draft, primaryColor: event.target.value })}/></div></label>
      <fieldset className="template-size-controls"><legend>Text sizes <span>pixels</span></legend>{sizeControls.map(control => <label key={control.key}><span>{control.label}</span><div><input type="range" min={control.min} max={control.max} step="1" value={draft[control.key]} onChange={event => setDraft({ ...draft, [control.key]: Number(event.target.value) })}/><input type="number" min={control.min} max={control.max} step="1" value={draft[control.key]} aria-label={`${control.label} size in pixels`} onChange={event => setDraft({ ...draft, [control.key]: Number(event.target.value) })}/><b>px</b></div></label>)}</fieldset>
      <label>Cover/background image URL <span>optional</span><input type="url" placeholder="https://example.com/image.jpg" value={draft.imageUrl} onChange={event => setDraft({ ...draft, imageUrl: event.target.value })}/><small>Use a secure HTTPS image. Leave blank for the template artwork.</small></label>
      <div className="template-editor-sample" style={{ ...menuDesignVariables(draft, editing), backgroundImage: draft.imageUrl ? `linear-gradient(rgba(255,255,255,.78),rgba(255,255,255,.78)),url(${draft.imageUrl})` : undefined } as React.CSSProperties}><small>LIVE STYLE SAMPLE</small><h3 className="menu-restaurant-name">{restaurant.name}</h3><p className="menu-subtitle">Your menu subtitle appears here</p><strong className="menu-cover-title">MENU</strong><div className="template-editor-menu-row"><div><h4 className="menu-category-name">STARTERS</h4><b className="menu-dish-name">Signature Dish</b><p className="menu-dish-description">Fresh ingredients and house spices</p></div><span className="menu-dish-price">₹299</span></div><address className="menu-address">Restaurant address</address></div>
    </div><footer><button type="button" onClick={() => setEditing(null)}>Cancel</button><button className="template-apply-button" disabled={busy === 'design'}>{busy === 'design' ? 'Saving…' : 'Save design'}</button></footer></form></div>}
  </main>
}
