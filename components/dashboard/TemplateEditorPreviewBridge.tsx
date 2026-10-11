'use client'

import { useEffect, useState } from 'react'
import type { MenuData } from '@/types'
import { googleFontStylesheetUrl, menuDesignVariables } from '@/lib/menu-fonts'
import MenuTier1 from '@/app/menu/[slug]/components/MenuTier1'
import GreenBistroMenu from '@/components/menu/GreenBistroMenu'
import ItalianMenu from '@/components/menu/ItalianMenu'
import BloomBrunchMenu from '@/components/menu/BloomBrunchMenu'

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
  const fontUrl = googleFontStylesheetUrl(design.font)
  return <div style={menuDesignVariables(design, template) as React.CSSProperties}>
    {fontUrl && <link rel="stylesheet" href={fontUrl} />}
    {template === 'B' ? <GreenBistroMenu data={previewData} /> : template === 'C' ? <ItalianMenu data={previewData} /> : template === 'D' ? <BloomBrunchMenu data={previewData} /> : <MenuTier1 data={previewData} />}
  </div>
}
