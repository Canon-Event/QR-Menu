'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function OrderBillLink({ orderToken }: { orderToken: string }) {
  const [billToken, setBillToken] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const response = await fetch(`/api/public/billing/order/${orderToken}`, { cache: 'no-store' })
        if (response.ok && active) setBillToken((await response.json()).billToken || null)
      } catch { /* Existing order confirmation remains usable without billing. */ }
    }
    void refresh()
    const timer = setInterval(() => { if (!document.hidden) void refresh() }, 15000)
    return () => { active = false; clearInterval(timer) }
  }, [orderToken])
  return billToken ? <p><Link href={`/bill/${billToken}`}>View your bill & payment options →</Link></p> : null
}
