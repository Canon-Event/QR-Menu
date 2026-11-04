'use client'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export default function BillQr({ token }: { token: string }) {
  const [source, setSource] = useState('')
  useEffect(() => {
    let active = true
    QRCode.toDataURL(`${window.location.origin}/bill/${token}`, { width: 180, margin: 1 }).then(value => { if (active) setSource(value) }).catch(() => {})
    return () => { active = false }
  }, [token])
  return source ? <div className="pos-bill-qr"><img src={source} width={120} height={120} alt="QR code to view or pay this bill" /><small>Scan to view your bill and payment options.</small></div> : null
}
