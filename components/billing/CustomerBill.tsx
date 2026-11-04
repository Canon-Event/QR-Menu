'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import Receipt, { type ReceiptBill } from './Receipt'
import { money } from '@/lib/pos'

type RazorpayWindow = Window & { Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, listener: () => void): void } }
export default function CustomerBill({ token, initialBill, gatewayReady }: { token: string; initialBill: ReceiptBill; gatewayReady: boolean }) {
  const [bill, setBill] = useState(initialBill), [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [message, setMessage] = useState('')
  const requestKey = useRef<string>('')
  useEffect(() => { requestKey.current = '' }, [bill.balance_paise])
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/public/billing/${token}`, { cache: 'no-store' })
      if (response.ok) setBill((await response.json()).bill)
    } catch { /* Preserve the receipt while the network is unavailable. */ }
  }, [token])
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) void refresh() }, 5000); return () => clearInterval(timer) }, [refresh])
  async function pay() {
    setBusy(true); setMessage('')
    try {
      requestKey.current ||= crypto.randomUUID()
      const response = await fetch('/api/public/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, request_key: requestKey.current }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not open payment.')
      const Checkout = (window as RazorpayWindow).Razorpay
      if (!Checkout) throw new Error('Payment checkout could not load. Please refresh and try again.')
      const checkout = new Checkout({
        key: result.keyId, order_id: result.orderId, amount: result.amount, currency: result.currency, name: result.name,
        description: bill.invoice_number,
        handler: async (payment: { razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            const verification = await fetch('/api/public/billing/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, checkoutId: result.checkoutId, paymentId: payment.razorpay_payment_id, signature: payment.razorpay_signature }) })
            const status = await verification.json()
            setMessage(status.confirmed ? 'Payment received. Thank you.' : status.message || status.error || 'Waiting for payment confirmation. Your bill will update automatically.')
          } catch { setMessage('Waiting for payment confirmation. Your bill will update automatically.') }
          await refresh(); setBusy(false)
        },
        modal: { ondismiss: () => { setBusy(false); void refresh() } },
      })
      checkout.on('payment.failed', () => { setMessage('The payment did not complete. You can try again.'); setBusy(false); void refresh() })
      checkout.open()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Payment is unavailable.'); setBusy(false); await refresh() }
  }
  return <main className="pos-app pos-guest">
    {gatewayReady && <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" onReady={() => setReady(true)} onError={() => setMessage('Online checkout could not load. Please try again shortly.')} />}
    <div className="pos-guest-actions pos-no-print"><span className="pos-badge">{Number(bill.credited_paise) === Number(bill.total_paise) ? 'Credited' : Number(bill.balance_paise) === 0 ? 'Paid' : `Due ${money(bill.balance_paise)}`}</span><button type="button" onClick={() => window.print()}>Print / save PDF</button></div>
    <Receipt bill={bill} token={token} />
    <section className="pos-panel pos-no-print" aria-live="polite">{message && <p role="status">{message}</p>}{Number(bill.balance_paise) > 0 && (gatewayReady ? <button className="pos-primary" type="button" disabled={busy || !ready} onClick={pay}>{busy ? 'Waiting for payment…' : `Pay ${money(bill.balance_paise)} online`}</button> : <p>Online payments are not connected for this restaurant.</p>)}{Number(bill.overpaid_paise) > 0 && <p>Please contact the restaurant about the overpayment shown on your receipt.</p>}<p className="pos-small">Payment status updates after confirmation from the payment provider.</p></section>
  </main>
}
