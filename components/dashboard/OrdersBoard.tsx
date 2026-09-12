'use client'
import { useState } from 'react'
import { formatCurrency } from '@/lib/currency'

type Item = { dish_name: string; quantity: number; line_total: number }
type Order = { id: string; order_number: number; customer_name: string; customer_phone?: string; customer_note?: string; status: string; currency: string; total: number; created_at: string; order_items: Item[] }
const statuses = ['pending','confirmed','preparing','ready','completed','cancelled']
export default function OrdersBoard({ initialOrders }: { initialOrders: Order[] }) {
  const [orders, setOrders] = useState(initialOrders); const [busy, setBusy] = useState(''); const [error, setError] = useState('')
  async function update(id: string, status: string) { setBusy(id); setError(''); const response = await fetch('/api/orders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }); const result = await response.json().catch(() => ({})); if (response.ok) setOrders(items => items.map(item => item.id === id ? result.order : item)); else setError(result.error || 'Could not update order.'); setBusy('') }
  return <div className="orders-list">{error && <div className="menu-flash error">{error}</div>}{orders.length ? orders.map(order => <article className="order-card" key={order.id}><header><div><span>#{order.order_number}</span><h2>{order.customer_name}</h2><small>{new Date(order.created_at).toLocaleString('en-IN')}</small></div><b>{formatCurrency(order.total, order.currency)}</b></header><div className="order-items">{order.order_items.map((item, index) => <span key={index}>{item.quantity}× {item.dish_name}</span>)}</div>{order.customer_note && <p className="order-note">“{order.customer_note}”</p>}<footer><span>{order.customer_phone || 'No phone provided'}</span><select aria-label="Order status" disabled={busy === order.id} value={order.status} onChange={event => update(order.id, event.target.value)}>{statuses.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></footer></article>) : <div className="menu-empty"><b>No orders yet.</b><p>New customer orders will appear here automatically.</p></div>}</div>
}
