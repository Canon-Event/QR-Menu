'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function EmployeeDemoNotice({ demoMode }: { demoMode: boolean }) {
  const [target, setTarget] = useState<Element | null>(null)

  useEffect(() => setTarget(document.querySelector('.ems-header')), [])
  if (!target) return null

  return createPortal(
    <a
      className={`employee-demo-toggle${demoMode ? ' active' : ''}`}
      href={demoMode ? '/dashboard/employees' : '/dashboard/employees?demo=1'}
      aria-pressed={demoMode}
      title={demoMode ? 'Exit sample preview and return to live employee data' : 'Preview employee management with temporary sample data'}
    >
      {demoMode ? 'Exit sample preview' : 'Sample data preview'}
    </a>,
    target,
  )
}
