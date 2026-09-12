'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function EmployeePortalLink({ href }: { href: string }) {
  const [header, setHeader] = useState<Element | null>(null)
  useEffect(() => setHeader(document.querySelector('.ems-header')), [])
  if (!header) return null
  return createPortal(<a className="employee-portals-link" href={href} target="_blank" rel="noopener noreferrer">Open leave portal ↗</a>, header)
}
