'use client'

import { useEffect, useState } from 'react'
import type { MenuData } from '@/types'
import MenuDocument from '@/components/menu/MenuDocument'

// Use the public renderers so category changes rebuild the actual page layout.
export default function TemplateEditorPreviewBridge({ data }: { data: MenuData }) {
  const template = data.restaurant.template
  const [design, setDesign] = useState(data.restaurant.template_settings?.[template] || {})
  useEffect(() => {
    function updatePreview(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent) return
      if (event.data?.type !== 'qrmenu:template-draft' || !event.data.design || typeof event.data.design !== 'object' || Array.isArray(event.data.design)) return
      setDesign(event.data.design)
    }
    window.addEventListener('message', updatePreview)
    window.parent.postMessage({ type: 'qrmenu:preview-ready' }, window.location.origin)
    return () => window.removeEventListener('message', updatePreview)
  }, [])
  const previewData: MenuData = { ...data, restaurant: { ...data.restaurant, template_settings: { ...data.restaurant.template_settings, [template]: design } } }
  return <MenuDocument data={previewData} />
}
