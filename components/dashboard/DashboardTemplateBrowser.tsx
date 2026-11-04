'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import DashboardTemplatePreview from './DashboardTemplatePreview'

const templates = [
  { id: 'A', name: 'Heritage', detail: 'Warm & timeless' },
  { id: 'B', name: 'Green Bistro', detail: 'Fresh & botanical' },
  { id: 'C', name: 'Italian', detail: 'Classic & elegant' },
  { id: 'D', name: 'Bloom & Brunch', detail: 'Bright & playful' },
]

function Arrow({ direction = 'right' }: { direction?: 'left' | 'right' }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={direction === 'left' ? { transform: 'rotate(180deg)' } : undefined}><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
}

export default function DashboardTemplateBrowser({ activeTemplate }: { activeTemplate: string }) {
  const track = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [canBack, setCanBack] = useState(false)
  const [canForward, setCanForward] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const isOpen = selected !== null
  const template = selected === null ? null : templates[selected]

  const syncScroll = useCallback(() => {
    const element = track.current
    if (!element) return
    setCanBack(element.scrollLeft > 2)
    setCanForward(element.scrollLeft + element.clientWidth < element.scrollWidth - 2)
  }, [])

  useEffect(() => {
    const element = track.current
    if (!element) return
    const observer = new ResizeObserver(syncScroll)
    observer.observe(element)
    syncScroll()
    return () => observer.disconnect()
  }, [syncScroll])

  useEffect(() => {
    if (!isOpen || !dialog.current) return
    const element = dialog.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => {
      element.close()
      document.body.style.overflow = overflow
    }
  }, [isOpen])

  function browse(direction: number) {
    const element = track.current
    const card = element?.firstElementChild as HTMLElement | null
    if (!element || !card) return
    element.scrollBy({ left: direction * (card.offsetWidth + 12), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }

  function show(index: number) {
    setLoaded(false)
    setSelected((index + templates.length) % templates.length)
  }

  return <div className="dashboard-template-browser">
    <div ref={track} className="dashboard-template-track" role="list" aria-label="Menu designs" onScroll={syncScroll}>
      {templates.map((item, index) => <article className={`dashboard-design-card${activeTemplate === item.id ? ' is-active' : ''}`} role="listitem" key={item.id}>
        <button type="button" className="dashboard-design-open" onClick={() => show(index)} aria-label={`Preview ${item.name}${activeTemplate === item.id ? ', current design' : ''}`}>
          <div className="dashboard-design-art">
            <DashboardTemplatePreview template={item.id} name={item.name} />
            {activeTemplate === item.id && <span className="dashboard-design-active"><i />In use</span>}
            <span className="dashboard-design-peek"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>Preview</span>
          </div>
          <div className="dashboard-design-copy"><div><b>{item.name}</b><small>{item.detail}</small></div><span className="dashboard-design-arrow"><Arrow /></span></div>
        </button>
      </article>)}
    </div>
    <div className="dashboard-design-controls"><span><b>04</b> designs to make your own</span><div><button type="button" onClick={() => browse(-1)} disabled={!canBack} aria-label="Previous designs"><Arrow direction="left" /></button><button type="button" onClick={() => browse(1)} disabled={!canForward} aria-label="Next designs"><Arrow /></button></div></div>
    <dialog ref={dialog} className="dashboard-design-dialog" aria-labelledby="dashboard-design-title" onClose={() => setSelected(null)} onClick={event => { if (event.target === event.currentTarget) setSelected(null) }}>
      {template && <div className="dashboard-design-dialog-content">
        <header><div><small>MENU DESIGN {String(selected! + 1).padStart(2, '0')} / 04</small><h2 id="dashboard-design-title">{template.name}{template.id === activeTemplate && <span>In use</span>}</h2></div><button type="button" className="dashboard-design-close" onClick={() => setSelected(null)} aria-label="Close preview"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button></header>
        <div className="dashboard-design-dialog-preview" aria-busy={!loaded}>
          {!loaded && <span className="dashboard-design-loading" role="status">Loading your menu preview…</span>}
          <iframe key={template.id} title={`${template.name} design preview`} src={`/dashboard/menu-preview?template=${template.id}&embedded=1`} onLoad={() => setLoaded(true)} style={{ opacity: loaded ? 1 : 0 }} />
        </div>
        <footer><div className="dashboard-design-switch"><button type="button" onClick={() => show(selected! - 1)} aria-label="Preview previous design"><Arrow direction="left" /></button><button type="button" onClick={() => show(selected! + 1)} aria-label="Preview next design"><Arrow /></button></div><a href={`/dashboard/templates/${template.id}/edit`}>Customize design <Arrow /></a></footer>
      </div>}
    </dialog>
  </div>
}
