'use client'

import { useEffect } from 'react'
import { googleFontStylesheetUrl, menuDesignVariables } from '@/lib/menu-fonts'

type DraftDesign = Parameters<typeof menuDesignVariables>[0] & {
  imageUrl?: string
  menuImageOne?: string
  menuImageTwo?: string
  menuImageThree?: string
  menuImageFour?: string
  backImageUrl?: string
  [key: string]: unknown
}

export default function TemplateEditorPreviewBridge({ template }: { template: string }) {
  useEffect(() => {
    function updatePreview(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent) return
      if (event.data?.type !== 'qrmenu:template-draft') return
      const design = (event.data.design || {}) as DraftDesign
      const root = document.querySelector<HTMLElement>('.dashboard-menu-preview')
      if (!root) return
      const bistroMenu = document.querySelector<HTMLElement>('.green-bistro-menu')
      if (bistroMenu && (design.menuPageLayout === 'four' || design.menuPageLayout === 'botanical' || design.menuPageLayout === 'both')) {
        bistroMenu.dataset.menuPageLayout = design.menuPageLayout
      }
      Object.entries(menuDesignVariables(design, template)).forEach(([property, value]) => {
        if (value == null) root.style.removeProperty(property)
        else root.style.setProperty(property, String(value))
      })

      document.getElementById('google-font-draft-preview')?.remove()
      const fontUrl = googleFontStylesheetUrl(design.font)
      if (fontUrl) {
        const link = document.createElement('link')
        link.id = 'google-font-draft-preview'
        link.rel = 'stylesheet'
        link.href = fontUrl
        document.head.appendChild(link)
      }

      const artwork = document.querySelector<HTMLImageElement>('.heritage-menu-art')
      if (artwork) artwork.src = design.imageUrl?.startsWith('https://') ? design.imageUrl : '/templates/heritage/heritage-cover-v1.png'
      const cover = document.querySelector<HTMLImageElement>('.bistro-cover-food')
      if (cover) cover.src = design.imageUrl?.startsWith('https://') ? design.imageUrl : cover.dataset.defaultSrc || '/templates/green-bistro/cover-background-v2.png'
      const italianCover = document.querySelector<HTMLImageElement>('.italian-cover-background')
      if (italianCover) italianCover.src = design.imageUrl?.startsWith('https://') ? design.imageUrl : italianCover.dataset.defaultSrc || '/templates/italian/italian-cover-background-v1.png'
      const menuImages = [design.menuImageOne, design.menuImageTwo, design.menuImageThree, design.menuImageFour]
      document.querySelectorAll<HTMLImageElement>('[data-template-image-slot]').forEach(image => {
        const slot = Number(image.dataset.templateImageSlot || 0)
        const next = menuImages[slot]
        image.src = next?.startsWith('https://') ? next : image.dataset.defaultSrc || image.src
      })
      const back = document.querySelector<HTMLImageElement>('.bistro-back-image')
      if (back) back.src = design.backImageUrl?.startsWith('https://') ? design.backImageUrl : back.dataset.defaultSrc || '/templates/green-bistro/back-background-v2.png'
      Object.entries(design).forEach(([field, value]) => {
        if (typeof value !== 'string' || field.endsWith('Url') || field.startsWith('menuImage')) return
        document.querySelectorAll<HTMLElement>(`[data-template-field="${field}"]`).forEach(element => { element.textContent = value })
      })
    }
    window.addEventListener('message', updatePreview)
    return () => window.removeEventListener('message', updatePreview)
  }, [template])

  return null
}
