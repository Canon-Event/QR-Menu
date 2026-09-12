'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Dish, Restaurant } from '@/types'
import { formatCurrency } from '@/lib/currency'

export default function CustomerMenuActions({ restaurant, dishes }: { restaurant: Restaurant; dishes: Dish[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const key = 'qrmenu-visitor-id'; let session = localStorage.getItem(key)
    if (!session) { session = crypto.randomUUID(); localStorage.setItem(key, session) }
    fetch('/api/public/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: restaurant.slug, session }), keepalive: true }).catch(() => {})
  }, [restaurant.slug])
  const count = Object.values(cart).reduce((sum, qty) => sum + qty, 0)
  const total = useMemo(() => dishes.reduce((sum, dish) => sum + Number(dish.price) * (cart[dish.id] || 0), 0), [cart, dishes])
  function change(id: string, amount: number) { setCart(current => { const quantity = Math.max(0, Math.min(99, (current[id] || 0) + amount)); const next = { ...current }; if (quantity) next[id] = quantity; else delete next[id]; return next }) }
  async function checkout(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch('/api/public/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: restaurant.slug, idempotencyKey: crypto.randomUUID(), customerName, phone, note, items: Object.entries(cart).map(([dishId, quantity]) => ({ dishId, quantity })) }) })
      const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || 'Could not place order.')
      router.push(`/order/${result.public_token}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not place order.'); setBusy(false) }
  }
  return <><button className="customer-order-button" onClick={() => setOpen(true)}>Order now {count > 0 && <span>{count}</span>}</button>{open && <div className="customer-order-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}><section className="customer-order-sheet"><header><div><h2>Your order</h2><p>{restaurant.name}</p></div><button onClick={() => setOpen(false)} aria-label="Close">×</button></header><div className="customer-dish-list">{dishes.map(dish => <article key={dish.id}><div><b>{dish.name}</b><small>{formatCurrency(dish.price, restaurant.currency)}</small></div><div className="customer-quantity">{cart[dish.id] > 0 && <button onClick={() => change(dish.id, -1)}>−</button>}<span>{cart[dish.id] || 0}</span><button onClick={() => change(dish.id, 1)}>+</button></div></article>)}</div>{count > 0 && <form className="customer-checkout" onSubmit={checkout}><div className="customer-total"><span>Total</span><b>{formatCurrency(total, restaurant.currency)}</b></div><label>Name<input required minLength={2} maxLength={100} value={customerName} onChange={event => setCustomerName(event.target.value)} /></label><label>Phone <span>(optional)</span><input type="tel" maxLength={30} value={phone} onChange={event => setPhone(event.target.value)} /></label><label>Note <span>(optional)</span><textarea maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="Table number, allergies, or requests" /></label>{error && <p className="customer-order-error">{error}</p>}<button className="customer-place-order" disabled={busy}>{busy ? 'Placing order…' : 'Confirm order'}</button><small>Prices and availability are verified when you order.</small></form>}</section></div>}</>
}
