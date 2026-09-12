'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function TemplatePreviewActions() {
  const [cards, setCards] = useState<Element[]>([])
  useEffect(() => setCards(Array.from(document.querySelectorAll('.settings-template-grid > button'))), [])
  return <>{cards.map((card, index) => createPortal(<span className="template-live-preview" role="link" tabIndex={0} onClick={(event) => { event.stopPropagation(); window.open(`/dashboard/menu-preview?template=${['A','B','C'][index]}`, '_blank', 'noopener,noreferrer') }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); window.open(`/dashboard/menu-preview?template=${['A','B','C'][index]}`, '_blank', 'noopener,noreferrer') } }}>Preview ↗</span>, card))}</>
}
