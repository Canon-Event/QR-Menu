'use client'

import { useState, type CSSProperties } from 'react'
import { BASIC_COVER_IMAGES, BASIC_FONTS, BASIC_MENU_PRESETS, type BasicMenuStyle } from '@/lib/ai-menu'
import type { Dish } from '@/types'
import MenuLogoControls from './MenuLogoControls'

type Props = { style: BasicMenuStyle; onChange: (style: BasicMenuStyle) => void; disabled: boolean; dishes: Dish[]; onError: (message: string) => void; onUploading: (uploading: boolean) => void; branding?:{url:string;restaurantName:string;onChange:(url:string)=>void} }

export default function BasicMenuStyleEditor({ style, onChange, disabled, dishes, onError, onUploading, branding }: Props) {
  const [uploading, setUploading] = useState(false)
  const [logoBusy,setLogoBusy]=useState(false)
  const update = (patch: Partial<BasicMenuStyle>) => onChange({ ...style, ...patch })
  const activePreset = BASIC_MENU_PRESETS.find(preset => (['font', 'accent', 'background', 'text', 'layout', 'backdrop'] as const).every(key => (style[key] ?? (key === 'layout' ? 'editorial' : key === 'backdrop' ? 'glow' : undefined)) === preset.style[key]))?.id

  async function upload(file?: File) {
    if (!file) return
    onError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) { onError('Choose a JPG, PNG or WebP cover under 4 MB.'); return }
    setUploading(true); onUploading(true)
    try {
      // Resize once on upload; guests receive the small result, not the original.
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) { bitmap.close(); throw new Error('Could not prepare this image. Try another photo.') }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close()
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', .82))
      if (!blob) throw new Error('Could not prepare this image. Try another photo.')
      const form = new FormData(); form.set('slot', 'imageUrl'); form.set('image', blob, 'menu-cover.webp')
      const response = await fetch('/api/settings/template-image', { method: 'POST', body: form })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.imageUrl) throw new Error(result.error || 'Cover upload failed. Please try again.')
      update({ heroImage: result.imageUrl })
    } catch (reason) { onError(reason instanceof Error ? reason.message : 'Cover upload failed. Please try again.') }
    finally { setUploading(false); onUploading(false) }
  }

  return <fieldset disabled={disabled || uploading || logoBusy} className="ai-menu-style-fields">
    <div className="ai-design-label"><span>01 / Start with a look</span><small>Make it yours from here</small></div>
    <div className="ai-design-presets" role="group" aria-label="Menu design presets">{BASIC_MENU_PRESETS.map(preset => <button type="button" key={preset.id} aria-pressed={activePreset === preset.id} className="ai-design-preset" onClick={() => onChange({ ...preset.style, heroImage: style.heroImage || '', tagline: style.tagline || '', showImages: style.showImages ?? true })}>
      <span className={`ai-design-preset-art is-${preset.id}`} style={{ '--preset-bg': preset.style.background, '--preset-ink': preset.style.accent } as CSSProperties} aria-hidden="true"><i /><b>Aa</b><span /><span /></span><strong>{preset.name}</strong><small>{preset.description}</small>{activePreset === preset.id && <span className="ai-design-selected" aria-hidden="true">✓</span>}
    </button>)}</div>

    <div className="ai-design-label"><span>02 / Set the mood</span><small>Your palette, your personality</small></div>
    <div className="ai-menu-colours">{(['accent', 'background', 'text'] as const).map(key => <label key={key}>{key[0].toUpperCase() + key.slice(1)}<span className="ai-design-color"><input aria-label={`${key} colour`} type="color" value={style[key]} onChange={event => update({ [key]: event.target.value })} /><span>{style[key].toUpperCase()}</span></span></label>)}</div>
    <div className="ai-menu-row"><label>Font<select aria-label="Font" value={style.font} onChange={event => update({ font: event.target.value as BasicMenuStyle['font'] })}>{BASIC_FONTS.map(font => <option key={font} value={font}>{font === 'playfair' ? 'Playfair · elegant' : font === 'poppins' ? 'Poppins · playful' : 'Manrope · modern'}</option>)}</select></label><label>Spacing<select aria-label="Spacing" value={style.density} onChange={event => update({ density: event.target.value as BasicMenuStyle['density'] })}><option value="comfortable">Room to breathe</option><option value="compact">Compact & tidy</option></select></label></div>
    <label>Dish layout</label><div className="ai-design-segments" role="group" aria-label="Dish layout">{(['editorial', 'cards'] as const).map(layout => <button type="button" key={layout} aria-pressed={(style.layout || 'editorial') === layout} onClick={() => update({ layout })}><span aria-hidden="true">{layout === 'editorial' ? '☷' : '▦'}</span>{layout === 'editorial' ? 'Editorial list' : 'Dish cards'}</button>)}</div>

    <div className="ai-design-label"><span>03 / A little atmosphere</span><small>Subtle by design</small></div>
    <label>Background effect<select aria-label="Background effect" value={style.backdrop || 'glow'} onChange={event => update({ backdrop: event.target.value as BasicMenuStyle['backdrop'] })}><option value="glow">Soft colour wash</option><option value="dots">Paper dots</option><option value="grid">Fine grid</option><option value="none">Clean canvas</option></select></label>
    <label className="ai-design-switch"><span>Gentle background movement<small>A slow colour drift. Respects reduced motion.</small></span><input type="checkbox" aria-label="Gentle background movement" checked={style.motion === 'gentle'} disabled={(style.backdrop || 'glow') !== 'glow'} onChange={event => update({ motion: event.target.checked ? 'gentle' : 'none' })} /></label>

    <div className="ai-design-label"><span>04 / Tell your story</span><small>Give your menu a cover</small></div>
    {branding&&<MenuLogoControls url={branding.url} restaurantName={branding.restaurantName} onChange={branding.onChange} onError={onError} onUploading={busy=>{setLogoBusy(busy);onUploading(busy)}}/>}
    <label>Menu tagline<input maxLength={100} value={style.tagline || ''} placeholder="Good food. Great company." onChange={event => update({ tagline: event.target.value })} /></label>
    <div className="ai-design-covers" role="group" aria-label="Cover photo"><button type="button" aria-pressed={!style.heroImage} onClick={() => update({ heroImage: '' })}><span className="ai-design-no-cover" aria-hidden="true">✳</span><span>No photo</span></button>{BASIC_COVER_IMAGES.map(image => <button type="button" key={image.src} aria-pressed={style.heroImage === image.src} onClick={() => update({ heroImage: image.src })}><img src={image.src} loading="lazy" width="112" height="80" alt="" /><span>{image.label}</span></button>)}</div>
    <label className="ai-design-upload">{uploading ? 'Preparing your cover…' : 'Upload your own cover'}<input type="file" aria-label="Upload cover photo" accept="image/jpeg,image/png,image/webp" onChange={event => { void upload(event.target.files?.[0]); event.target.value = '' }} /><small>JPG, PNG or WebP, up to 4 MB. Resized for a faster menu.</small></label>
    <details className="ai-design-image-options"><summary>Use an image link or an existing dish photo</summary><label>Cover image URL<input type="url" maxLength={2048} value={style.heroImage || ''} placeholder="https://…" onChange={event => update({ heroImage: event.target.value })} /></label>{dishes.some(dish => dish.image_url) && <label>Use a dish photo<select aria-label="Use a dish photo" value={dishes.some(dish => dish.image_url === style.heroImage) ? style.heroImage : ''} onChange={event => { if (event.target.value) update({ heroImage: event.target.value }) }}><option value="">Choose a dish photo</option>{dishes.filter(dish => dish.image_url).map(dish => <option key={dish.id} value={dish.image_url}>{dish.name}</option>)}</select></label>}</details>
    <label className="ai-design-switch"><span>Show dish photos<small>Uses the photos you add in Dishes & categories.</small></span><input type="checkbox" aria-label="Show dish photos" checked={style.showImages !== false} onChange={event => update({ showImages: event.target.checked })} /></label>
  </fieldset>
}
