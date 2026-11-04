'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

const previewWidth = 480
const previewHeight = 640

export default function DashboardTemplatePreview({ template, name }: { template: string; name: string }) {
  const container = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ scale: 0, overflow: 0 })

  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const scale = entry.contentRect.width / previewWidth
      setSize({ scale, overflow: Math.max(0, previewHeight * scale - entry.contentRect.height) })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return <div ref={container} className="dashboard-template-preview" aria-hidden="true" style={{
    '--cover-scale': size.scale,
    '--cover-overflow': `${size.overflow}px`,
  } as CSSProperties}>
    <iframe
      title={`${name} menu cover`}
      src={`/dashboard/menu-preview?template=${template}&embedded=1&thumbnail=1`}
      width={previewWidth}
      height={previewHeight}
      loading="lazy"
      tabIndex={-1}
    />
  </div>
}
