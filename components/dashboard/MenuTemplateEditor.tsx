'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

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
  coverEyebrow?: string
  coverSideNote?: string
  coverTagline?: string
  menuLabel?: string
  sectionKicker?: string
  categoryTagline?: string
  thankYouTitle?: string
  thankYouSubtitle?: string
  thankYouMessage?: string
  openingHours?: string
  coverMenuNote?: string
  coverFooter?: string
  socialHandle?: string
  reserveLabel?: string
  reserveMessage?: string
  ingredientNoteTitle?: string
  ingredientNote?: string
  closingFooter?: string
  menuImageOne?: string
  menuImageTwo?: string
  menuImageThree?: string
  menuImageFour?: string
  backImageUrl?: string
  menuPageLayout?: 'four' | 'botanical' | 'both'
}
type SizeKey = 'restaurantNameSize' | 'subtitleSize' | 'menuTitleSize' | 'categorySize' | 'dishNameSize' | 'descriptionSize' | 'priceSize' | 'addressSize'
type ImageKey = 'imageUrl' | 'menuImageOne' | 'menuImageTwo' | 'menuImageThree' | 'menuImageFour' | 'backImageUrl'
type FontMeta = { family: string; category: string; variants: string[] }

const defaults: Record<string, Design> = {
  A: { font: 'serif', primaryColor: '#854d48', imageUrl: '', restaurantNameSize: 38, subtitleSize: 12, menuTitleSize: 64, categorySize: 16, dishNameSize: 14, descriptionSize: 12, priceSize: 14, addressSize: 10 },
  B: { font: 'display', primaryColor: '#294236', imageUrl: '', restaurantNameSize: 68, subtitleSize: 13, menuTitleSize: 34, categorySize: 38, dishNameSize: 15, descriptionSize: 12, priceSize: 15, addressSize: 11, coverEyebrow: 'GOOD FOOD · BRIGHTER DAYS', coverSideNote: 'FRESH INGREDIENTS · GREAT COMPANY', coverTagline: 'Eat well · Be together', menuLabel: 'MENU', coverMenuNote: 'Thoughtfully crafted for brighter gatherings', coverFooter: 'A warmer table for a brighter tomorrow', sectionKicker: 'Simple ingredients · extraordinary moments', categoryTagline: 'Fresh flavours, brighter days', thankYouTitle: 'Thank You', thankYouSubtitle: 'for Dining With Us', thankYouMessage: 'Thank you for being part of our table. Good food tastes even better when shared.', openingHours: 'Please contact us for today’s hours', socialHandle: '@yourrestaurant', reserveLabel: 'RESERVE A TABLE', reserveMessage: 'Good food brings people together', ingredientNoteTitle: 'A NOTE ON INGREDIENTS', ingredientNote: 'We use fresh, high-quality ingredients and are happy to assist with dietary requirements or allergen information.', closingFooter: 'A brighter tomorrow tastes better together', menuImageOne: '', menuImageTwo: '', menuImageThree: '', menuImageFour: '', backImageUrl: '' },
  C: { font: 'bodoni-moda', primaryColor: '#601b28', imageUrl: '', restaurantNameSize: 82, subtitleSize: 14, menuTitleSize: 58, categorySize: 54, dishNameSize: 16, descriptionSize: 12, priceSize: 15, addressSize: 11, coverEyebrow: 'GOOD FOOD · BRIGHTER PEOPLE', coverSideNote: 'GOOD FOOD · BRIGHTER CONVERSATIONS', menuLabel: 'Menu', coverTagline: 'TIMELESS FLAVOURS · BEAUTIFUL MOMENTS', coverFooter: 'A TABLE FOR BRIGHTER DAYS', sectionKicker: 'ESTABLISHED', categoryTagline: 'SMALL PLATES · BEAUTIFUL MOMENTS', thankYouTitle: 'Thank You', thankYouSubtitle: 'FOR BEING PART OF OUR STORY', thankYouMessage: 'Your presence at our table means the world to us. Great food creates kinder conversations, brighter days, and a more beautiful tomorrow.', openingHours: 'Please contact us for today’s opening hours', socialHandle: '@yourrestaurant', reserveLabel: 'RESERVE A TABLE', reserveMessage: 'Scan the QR code to revisit our menu', closingFooter: 'À BIENTÔT' },
}
const names: Record<string, string> = { A: 'Heritage', B: 'Green Bistro', C: 'Italian' }
const bistroTextControls: { key: keyof Design; label: string; multiline?: boolean }[] = [
  { key: 'coverEyebrow', label: 'Cover left note' },
  { key: 'coverSideNote', label: 'Cover right note' },
  { key: 'coverTagline', label: 'Cover tagline' },
  { key: 'menuLabel', label: 'Menu title' },
  { key: 'coverMenuNote', label: 'Cover menu note' },
  { key: 'coverFooter', label: 'Cover footer line' },
  { key: 'sectionKicker', label: 'Section image caption' },
  { key: 'categoryTagline', label: 'Category tagline' },
  { key: 'thankYouTitle', label: 'Closing title' },
  { key: 'thankYouSubtitle', label: 'Closing subtitle' },
  { key: 'thankYouMessage', label: 'Closing message', multiline: true },
  { key: 'openingHours', label: 'Opening hours', multiline: true },
  { key: 'socialHandle', label: 'Social handle' },
  { key: 'reserveLabel', label: 'Reservation label' },
  { key: 'reserveMessage', label: 'Reservation message' },
  { key: 'ingredientNoteTitle', label: 'Ingredient note title' },
  { key: 'ingredientNote', label: 'Ingredient note', multiline: true },
  { key: 'closingFooter', label: 'Closing footer' },
]
const italianTextControls: { key: keyof Design; label: string; multiline?: boolean }[] = [
  { key: 'coverEyebrow', label: 'Closing-page left note' },
  { key: 'coverSideNote', label: 'Top-right note' },
  { key: 'menuLabel', label: 'Menu title' },
  { key: 'coverTagline', label: 'Menu tagline' },
  { key: 'coverFooter', label: 'Lower-left note' },
  { key: 'sectionKicker', label: 'Establishment line' },
  { key: 'categoryTagline', label: 'Category tagline' },
  { key: 'thankYouTitle', label: 'Closing title' },
  { key: 'thankYouSubtitle', label: 'Closing subtitle' },
  { key: 'thankYouMessage', label: 'Closing message', multiline: true },
  { key: 'openingHours', label: 'Opening hours', multiline: true },
  { key: 'socialHandle', label: 'Social handle' },
  { key: 'reserveLabel', label: 'Reservation label' },
  { key: 'reserveMessage', label: 'Reservation message' },
  { key: 'closingFooter', label: 'Closing footer' },
]
const bistroImageControls: { key: ImageKey; label: string; fallback: string }[] = [
  { key: 'imageUrl', label: 'Cover image', fallback: 'Supplied steak cover' },
  { key: 'menuImageOne', label: 'Menu image 1', fallback: 'First dish or supplied image' },
  { key: 'menuImageTwo', label: 'Menu image 2', fallback: 'First dish or supplied image' },
  { key: 'menuImageThree', label: 'Menu image 3', fallback: 'First dish or supplied image' },
  { key: 'menuImageFour', label: 'Menu image 4', fallback: 'First dish or supplied image' },
  { key: 'backImageUrl', label: 'Closing-page image', fallback: 'Supplied bistro image' },
]
const sizeControls: { key: SizeKey; label: string; min: number; max: number }[] = [
  { key: 'restaurantNameSize', label: 'Restaurant name', min: 14, max: 72 },
  { key: 'subtitleSize', label: 'Subtitle', min: 8, max: 36 },
  { key: 'menuTitleSize', label: 'MENU title', min: 24, max: 96 },
  { key: 'categorySize', label: 'Category heading', min: 10, max: 72 },
  { key: 'dishNameSize', label: 'Dish name', min: 10, max: 32 },
  { key: 'descriptionSize', label: 'Dish description', min: 8, max: 26 },
  { key: 'priceSize', label: 'Price', min: 10, max: 32 },
  { key: 'addressSize', label: 'Address', min: 8, max: 24 },
]

export default function MenuTemplateEditor({ template, savedDesign }: { template: string; savedDesign?: Partial<Design> }) {
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const initialDesign = useMemo(() => ({ ...defaults[template], ...(template === 'B' ? { menuPageLayout: 'both' as const } : {}), ...(savedDesign || {}) }), [savedDesign, template])
  const [draft, setDraft] = useState<Design>(initialDesign)
  const [fonts, setFonts] = useState<FontMeta[]>([])
  const [fontsState, setFontsState] = useState('Loading Google Fonts…')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<ImageKey | ''>('')
  const [message, setMessage] = useState('')

  function sendDraft() {
    iframeRef.current?.contentWindow?.postMessage({ type: 'qrmenu:template-draft', design: draft }, window.location.origin)
  }

  useEffect(() => { sendDraft() }, [draft])
  useEffect(() => {
    let active = true
    fetch('/api/google-fonts').then(async response => {
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Could not load Google Fonts.')
      if (active) {
        const list = Array.isArray(result.fonts) ? result.fonts : []
        setFonts(list)
        setFontsState(`${list.length} Google Fonts available`)
      }
    }).catch(error => { if (active) setFontsState(error instanceof Error ? error.message : 'Could not load Google Fonts.') })
    return () => { active = false }
  }, [])

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    const response = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'template_customization', template, ...draft }) })
    const result = await response.json().catch(() => ({}))
    setBusy(false)
    if (!response.ok) return setMessage(result.error || 'Could not save this design.')
    setMessage('All design changes are saved.')
    router.refresh()
  }

  async function uploadImage(slot: ImageKey, file?: File) {
    if (!file) return
    setUploading(slot)
    setMessage('')
    const form = new FormData()
    form.append('image', file)
    form.append('slot', slot)
    const response = await fetch('/api/settings/template-image', { method: 'POST', body: form })
    const result = await response.json().catch(() => ({}))
    setUploading('')
    if (!response.ok) return setMessage(result.error || 'Could not upload image.')
    setDraft(current => ({ ...current, [slot]: result.imageUrl }))
    setMessage('Image uploaded. Save changes to publish it.')
  }

  return <main className="template-workspace">
    <header className="template-workspace-header"><div><a href="/dashboard/templates">← All templates</a><span>EDITING TEMPLATE</span><h1>{names[template]} menu</h1></div><div><p className={message ? 'show' : ''} role="status">{message}</p><button type="submit" form="template-design-form" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div></header>
    <div className="template-workspace-grid">
      <form id="template-design-form" className="template-workspace-controls" onSubmit={save}>
        {template === 'B' && <section className="workspace-layout-section"><header><b>Menu page structure</b><small>Choose either inner-page design, or include both designs in the published menu.</small></header><div className="workspace-layout-options">{[
          { value: 'both', title: 'Use both', description: 'Show the split page, followed by the four-section page.' },
          { value: 'botanical', title: 'Split page', description: 'Starters on the left, with two sections on the right.' },
          { value: 'four', title: 'Four sections', description: 'Stack four menu categories with large food images.' },
        ].map(option => <label className={draft.menuPageLayout === option.value ? 'active' : ''} key={option.value}><input type="radio" name="menuPageLayout" value={option.value} checked={draft.menuPageLayout === option.value} onChange={() => setDraft({ ...draft, menuPageLayout: option.value as Design['menuPageLayout'] })}/><b>{option.title}</b><span>{option.description}</span></label>)}</div></section>}
        {template === 'B' && <section><header><b>Menu wording</b><small>Every decorative line is editable. Restaurant details, categories and dishes come from your dashboard.</small></header><div className="workspace-copy-list">{bistroTextControls.map(control => <label key={control.key}>{control.label}{control.multiline ? <textarea rows={3} maxLength={240} value={String(draft[control.key] || '')} onChange={event => setDraft({ ...draft, [control.key]: event.target.value })}/> : <input maxLength={100} value={String(draft[control.key] || '')} onChange={event => setDraft({ ...draft, [control.key]: event.target.value })}/>}</label>)}</div></section>}
        {template === 'C' && <section><header><b>Menu wording</b><small>Edit the cover, menu-page and closing-page wording. Restaurant contact details come from restaurant settings.</small></header><div className="workspace-copy-list">{italianTextControls.map(control => <label key={control.key}>{control.label}{control.multiline ? <textarea rows={3} maxLength={240} value={String(draft[control.key] || '')} onChange={event => setDraft({ ...draft, [control.key]: event.target.value })}/> : <input maxLength={100} value={String(draft[control.key] || '')} onChange={event => setDraft({ ...draft, [control.key]: event.target.value })}/>}</label>)}</div></section>}
        <section><header><b>Typography</b><small>Choose a heading font and control every line separately.</small></header><label>Google Font <span>{fontsState}</span><input list="workspace-google-fonts" value={draft.font} placeholder="Search Google Fonts" autoComplete="off" onChange={event => setDraft({ ...draft, font: event.target.value })}/><datalist id="workspace-google-fonts"><option value="serif">Georgia Heritage</option><option value="sans">Manrope Modern</option><option value="display">DM Serif Display</option><option value="great-vibes">Great Vibes Script</option><option value="bodoni-moda">Bodoni Moda Italic</option>{fonts.map(font => <option key={font.family} value={font.family}>{font.category}</option>)}</datalist></label><div className="workspace-size-list">{sizeControls.map(control => <label key={control.key}><span>{control.label}</span><div><input type="range" min={control.min} max={control.max} step="1" value={draft[control.key]} onChange={event => setDraft({ ...draft, [control.key]: Number(event.target.value) })}/><input type="number" min={control.min} max={control.max} step="1" value={draft[control.key]} aria-label={`${control.label} in pixels`} onChange={event => setDraft({ ...draft, [control.key]: Number(event.target.value) })}/><b>px</b></div></label>)}</div></section>
        <section><header><b>Colors & artwork</b><small>Upload an image or use a secure URL. Changes appear instantly.</small></header><label>Primary color<div className="workspace-color"><input type="color" value={draft.primaryColor} onChange={event => setDraft({ ...draft, primaryColor: event.target.value })}/><input value={draft.primaryColor} pattern="#[0-9a-fA-F]{6}" onChange={event => setDraft({ ...draft, primaryColor: event.target.value })}/></div></label>{(template === 'B' ? bistroImageControls : bistroImageControls.slice(0, 1)).map(control => <div className="workspace-image-control" key={control.key}><label>{control.label}<span>{draft[control.key] ? 'Custom image selected' : control.fallback}</span><input type="url" placeholder="https://example.com/image.jpg" value={draft[control.key] || ''} onChange={event => setDraft({ ...draft, [control.key]: event.target.value })}/></label><label className="workspace-upload-button">{uploading === control.key ? 'Uploading…' : 'Upload image'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(uploading)} onChange={event => uploadImage(control.key, event.target.files?.[0])}/></label>{draft[control.key] && <button type="button" onClick={() => setDraft({ ...draft, [control.key]: '' })}>Use default image</button>}</div>)}</section>
      </form>
      <section className="template-workspace-preview"><header><div><i></i><span>Live preview</span></div><small>Updates before saving</small></header><div><iframe ref={iframeRef} onLoad={sendDraft} title={`${names[template]} menu live preview`} src={`/dashboard/menu-preview?template=${template}&embedded=1`} /></div></section>
    </div>
  </main>
}
