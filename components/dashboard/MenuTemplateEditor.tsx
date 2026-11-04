'use client'

import { useEffect, useRef, useState, type FormEvent, type SetStateAction } from 'react'
import type { Category } from '@/types'
import { defaults, names, resolveMenuDesign, menuColorContrast, menuCopyLimits, sizeControls, heritageTextControls, bistroTextControls, italianTextControls, bloomTextControls, bistroImageControls, bloomImageControls, type Design, type ImageKey } from '@/lib/menu-design'
import CategoryArtworkControls from './CategoryArtworkControls'

type Props = { template: string; savedDesign?: Partial<Design>; categories: Category[]; uncategorizedCount: number; restaurantId?: string; activeTemplate?: string; slug?: string }
const serialize = (design: Design) => JSON.stringify(design)
const fontChoices = [['serif','Georgia · classic'],['sans','Manrope · modern'],['display','DM Serif · editorial'],['playfair','Playfair Display'],['cinzel','Cinzel'],['cormorant','Cormorant Garamond'],['poppins','Poppins'],['great-vibes','Great Vibes · script'],['kalam','Kalam · handwritten'],['patrick-hand','Patrick Hand'],['bodoni-moda','Bodoni Moda']]

export default function MenuTemplateEditor({ template, savedDesign, categories, uncategorizedCount, restaurantId = 'restaurant', activeTemplate, slug }: Props) {
  const initial = resolveMenuDesign(template, savedDesign)
  const [draft, updateDraft] = useState<Design>(initial)
  const [saved, setSaved] = useState<Design>(initial)
  const [history, setHistory] = useState<Design[]>([])
  const [recovered, setRecovered] = useState<Design | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [fonts, setFonts] = useState<string[]>([])
  const [fontMessage, setFontMessage] = useState('')
  const [view, setView] = useState('edit')
  const [previewMode, setPreviewMode] = useState('fit')
  const [previewWidth, setPreviewWidth] = useState(0)
  const [previewReady, setPreviewReady] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const storageKey = `wiit:menu-draft:${restaurantId}:${template}`
  const dirty = serialize(draft) !== serialize(saved)
  const contrast = menuColorContrast(draft.primaryColor, template)
  const textControls = template === 'B' ? bistroTextControls : template === 'C' ? italianTextControls : template === 'D' ? bloomTextControls : heritageTextControls
  const imageControls = template === 'B' ? bistroImageControls : template === 'D' ? bloomImageControls : bistroImageControls.slice(0, 1)

  function setDraft(value: SetStateAction<Design>) {
    const previous = draftRef.current
    const next = typeof value === 'function' ? value(previous) : value
    if (serialize(next) === serialize(previous)) return
    setHistory(current => [...current.slice(-49), previous])
    if (serialize(next) === serialize(saved)) { try { sessionStorage.removeItem(storageKey) } catch {} }
    draftRef.current = next; updateDraft(next); setMessage(''); setError('')
  }
  function undo() {
    if (!history.length) return
    const previous=history[history.length - 1]
    updateDraft(previous); setHistory(history.slice(0, -1)); setMessage('Last edit undone.'); setError('')
    if (serialize(previous) === serialize(saved)) { try { sessionStorage.removeItem(storageKey) } catch {} }
  }
  function sendDraft() { iframeRef.current?.contentWindow?.postMessage({ type: 'qrmenu:template-draft', design: draftRef.current }, window.location.origin) }
  useEffect(() => { sendDraft() }, [draft])
  useEffect(() => {
    const onReady = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.source === iframeRef.current?.contentWindow && event.data?.type === 'qrmenu:preview-ready') { setPreviewReady(true); sendDraft() }
    }
    window.addEventListener('message', onReady)
    const observer = new ResizeObserver(entries => setPreviewWidth(Math.round(entries[0].contentRect.width)))
    if (iframeRef.current) observer.observe(iframeRef.current)
    return () => { window.removeEventListener('message', onReady); observer.disconnect() }
  }, [])
  useEffect(() => {
    try { const cached = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); if (cached?.base === serialize(initial) && cached.draft) setRecovered(cached.draft) } catch { /* Recovery is optional. */ }
  }, [storageKey])
  useEffect(() => {
    if (dirty) { try { sessionStorage.setItem(storageKey, JSON.stringify({ base: serialize(saved), draft })) } catch { /* Saving remains available. */ } }
  }, [draft, saved, dirty, storageKey])
  useEffect(() => {
    if (!dirty) return
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.target === '_blank' || anchor.getAttribute('href')?.startsWith('#') || event.ctrlKey || event.metaKey) return
      if (!window.confirm('Leave with unsaved changes? Your draft is kept in this tab, but is not published.')) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigate, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true) }
  }, [dirty])
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/google-fonts', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Font catalogue unavailable')
      const result = await response.json()
      setFonts(Array.isArray(result.fonts) ? result.fonts.map((font: { family: string }) => font.family) : [])
    }).catch(reason => { if (reason.name !== 'AbortError') setFontMessage('Font catalogue unavailable. Built-in fonts still work.') })
    return () => controller.abort()
  }, [])

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      if (!/^[A-Za-z0-9 .'-]{1,100}$/.test(draft.font)) throw new Error('Enter a font family name using letters, numbers, spaces or hyphens.')
      const payload = resolveMenuDesign(template, draft)
      const response = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'template_customization', template, ...payload }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Could not save this design. Please try again.')
      const persisted = resolveMenuDesign(template, result.restaurant?.template_settings?.[template] || payload)
      updateDraft(persisted); setSaved(persisted); setHistory([]); setRecovered(null)
      try { sessionStorage.removeItem(storageKey) } catch { /* optional recovery */ }
      setMessage(activeTemplate === template ? 'Saved. Your live menu is up to date.' : 'Design saved. Choose “Use” in templates to make it live.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Connection lost. Your edits are still here. Try saving again.') }
    finally { setBusy(false) }
  }
  async function uploadImage(slot: ImageKey, file?: File, categoryId?: string) {
    if (!file) return
    setUploading(categoryId || slot); setError(''); setMessage('')
    try {
      const form = new FormData(); form.append('image', file); form.append('slot', slot)
      const response = await fetch('/api/settings/template-image', { method: 'POST', body: form })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.imageUrl) throw new Error(result.error || 'Image upload failed. Please try again.')
      setDraft(current => categoryId ? { ...current, categoryPresentation: { ...current.categoryPresentation, [categoryId]: { ...current.categoryPresentation?.[categoryId], imageUrl: result.imageUrl } } } : { ...current, [slot]: result.imageUrl })
      setMessage('Image added to your preview. Save to keep it.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Upload failed. Please try again.') }
    finally { setUploading('') }
  }

  return <main className="menu-editor" data-view={view}>
    <header className="me-header"><div><a href="/dashboard/templates">← All templates</a><h1>{names[template]} <span>Design studio</span></h1></div><div className="me-header-actions"><span className="me-save-state" aria-live="polite">{busy ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}</span><button type="submit" form="menu-design-form" className="me-primary" disabled={busy || Boolean(uploading) || !dirty}>{busy ? 'Saving…' : 'Save design'}</button></div></header>
    {error && <div className="me-notice is-error" role="alert">{error}</div>}
    {message && <div className="me-notice" role="status">{message}</div>}
    {recovered && <div className="me-notice">You have an unsaved draft from this tab. <button onClick={() => { setDraft(recovered); setRecovered(null) }}>Restore draft</button><button onClick={() => { setRecovered(null); try { sessionStorage.removeItem(storageKey) } catch {} }}>Discard draft</button></div>}
    <nav className="me-mobile-tabs" aria-label="Editor view"><button aria-pressed={view === 'edit'} onClick={() => setView('edit')}>Edit design</button><button aria-pressed={view === 'preview'} onClick={() => setView('preview')}>Preview menu</button></nav>
    <div className="me-workspace">
      <form id="menu-design-form" className="me-controls" onSubmit={save}>
        <fieldset disabled={busy || Boolean(uploading)} className="me-fields">
          <section className="me-intro"><h2>Make it yours</h2><p>Start with the essentials. Your dishes, prices and restaurant details stay connected.</p><div><a href="/dashboard/settings?tab=restaurant">Restaurant details ↗</a><a href="/dashboard/menu">Edit dishes ↗</a></div></section>
          <details open className="me-group"><summary>Style & branding <span>Font and signature color</span></summary><div className="me-group-body">
            <label>Heading font<select aria-label="Heading font" value={fontChoices.some(([key]) => key === draft.font) ? draft.font : 'custom'} onChange={event => setDraft({ ...draft, font: event.target.value === 'custom' ? '' : event.target.value })}>{fontChoices.map(([key,label]) => <option value={key} key={key}>{label}</option>)}<option value="custom">Choose a Google Font…</option></select><small>Headings use this font; dish text keeps a readable body font.</small></label>
            {!fontChoices.some(([key]) => key === draft.font) && <label>Google Font family<input aria-label="Google Font family" list="me-fonts" value={draft.font} maxLength={100} required onChange={event => setDraft({ ...draft, font: event.target.value })} /><small>Custom fonts need an internet connection. A system serif is used while loading.</small></label>}
            <datalist id="me-fonts">{fonts.map(font => <option key={font} value={font} />)}</datalist>{fontMessage && <small>{fontMessage}</small>}
            <label>Signature color<div className="me-color"><input type="color" aria-label="Choose signature color" value={/^#[0-9a-f]{6}$/i.test(draft.primaryColor) ? draft.primaryColor : defaults[template].primaryColor} onChange={event => setDraft({ ...draft, primaryColor: event.target.value })} /><input aria-label="Signature color hex code" value={draft.primaryColor} pattern="#[0-9a-fA-F]{6}" required onChange={event => setDraft({ ...draft, primaryColor: event.target.value })} /></div><small>Choose a dark shade for readable headings on the paper background.</small></label>
          </div></details>
          {contrast > 0 && contrast < 4.5 && <div className="me-notice is-error" role="status">This color has low contrast on the menu paper ({contrast.toFixed(1)}:1). <button type="button" onClick={() => setDraft({ ...draft, primaryColor: defaults[template].primaryColor })}>Use template color</button></div>}
          <details className="me-group"><summary>Menu categories <span>Arrangement and category artwork</span></summary><div className="me-group-body">
            {template === 'B' && <label>Page arrangement<select value={draft.menuPageLayout} onChange={event => setDraft({ ...draft, menuPageLayout: event.target.value as Design['menuPageLayout'] })}><option value="both">Editorial columns</option><option value="botanical">Botanical columns</option><option value="four">Photo-led rows</option></select><small>Columns become a single readable list on phones.</small></label>}
            <CategoryArtworkControls categories={categories} uncategorizedCount={uncategorizedCount} template={template} value={draft.categoryPresentation || {}} onChange={categoryPresentation => setDraft(current => ({ ...current, categoryPresentation }))} onUpload={(id, file) => uploadImage('menuImageOne', file, id)} uploading={Boolean(uploading)} />
          </div></details>
          {!!textControls.length && <details className="me-group"><summary>Menu wording <span>Cover, welcome and closing message</span></summary><div className="me-group-body">{textControls.map(control => <label key={control.key}>{control.label}{control.multiline ? <textarea aria-label={control.label} rows={3} maxLength={menuCopyLimits[control.key]} value={String(draft[control.key] || '')} onChange={event => setDraft({ ...draft, [control.key]: event.target.value })} /> : <input aria-label={control.label} maxLength={menuCopyLimits[control.key]} value={String(draft[control.key] || '')} onChange={event => setDraft({ ...draft, [control.key]: event.target.value })} />}</label>)}</div></details>}
          <details className="me-group"><summary>Images & backgrounds <span>Template artwork or your own images</span></summary><div className="me-group-body">{imageControls.map(control => <div className="me-image-control" key={control.key}><label>{control.label}<input type="url" pattern="https://.*" maxLength={2048} placeholder="https://example.com/image.jpg" value={draft[control.key] || ''} onChange={event => setDraft({ ...draft, [control.key]: event.target.value })} /><small>{draft[control.key] ? 'Custom image selected' : control.fallback}</small></label><label>Upload image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { uploadImage(control.key, event.target.files?.[0]); event.target.value = '' }} /></label>{draft[control.key] && <button type="button" onClick={() => setDraft({ ...draft, [control.key]: '' })}>Restore template image</button>}</div>)}</div></details>
          <details className="me-group"><summary>Fine-tune typography <span>Optional size adjustments</span></summary><div className="me-group-body"><p>Cover headings adapt to screen width. Body text stays readable at every size.</p>{sizeControls.map(control => <label key={control.key}>{control.label}<div className="me-size"><input type="range" aria-label={`${control.label} size`} min={control.min} max={control.max} value={draft[control.key]} onChange={event => setDraft({ ...draft, [control.key]: Number(event.target.value) })} /><input type="number" aria-label={`${control.label} in pixels`} min={control.min} max={control.max} required value={draft[control.key]} onChange={event => setDraft({ ...draft, [control.key]: Number(event.target.value) })} /><span>px</span></div></label>)}</div></details>
          <section className="me-history"><button type="button" disabled={!history.length} onClick={undo}>↶ Undo</button><button type="button" disabled={!dirty} onClick={() => { if (window.confirm('Discard edits and return to your last saved design?')) { setDraft(saved); try { sessionStorage.removeItem(storageKey) } catch {} } }}>Revert saved</button><button type="button" onClick={() => { if (window.confirm('Restore this template’s default design? Your dishes and prices stay unchanged. You can undo this before saving.')) setDraft(resolveMenuDesign(template)) }}>Reset design</button></section>
        </fieldset>
        {uploading && <p className="me-upload-status" role="status">Uploading image…</p>}
      </form>
      <section className="me-preview" aria-label="Menu preview"><header><div><b>Live preview</b><small>{previewReady ? `${previewWidth}px wide · changes appear before saving` : 'Loading your menu…'}</small></div><div className="me-preview-modes"><button aria-pressed={previewMode === 'fit'} onClick={() => setPreviewMode('fit')}>Fit</button><button aria-pressed={previewMode === 'phone'} onClick={() => setPreviewMode('phone')}>Phone</button>{slug && <a href={`/menu/${slug}`} target="_blank" rel="noopener noreferrer">Live ↗</a>}</div></header><div className="me-preview-stage" data-mode={previewMode}><iframe ref={iframeRef} onLoad={sendDraft} title={`${names[template]} menu live preview`} src={`/dashboard/menu-preview?template=${template}&embedded=1`} /></div><footer>Your design is saved separately for each template. {activeTemplate === template ? 'Saving updates your live menu.' : 'This template is not currently live.'}</footer></section>
    </div>
  </main>
}
