'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatCurrency } from '@/lib/currency'
import { ORDER_TRANSITIONS, type ServiceOrder } from '@/lib/orders'

export default function OrdersBoard({ initialOrders, demoMode = false, apiUrl = '/api/orders', editable = true, initialError = '' }: { initialOrders: ServiceOrder[]; demoMode?: boolean; apiUrl?: string; editable?: boolean; initialError?: string }) {
  const [orders, setOrders] = useState(initialOrders), [busy, setBusy] = useState(''), [error, setError] = useState(initialError)
  const [cancelId, setCancelId] = useState(''), [reason, setReason] = useState('')
  const [history, setHistory] = useState(false), [cursor, setCursor] = useState<string | null>(null), [stack, setStack] = useState<(string | null)[]>([])
  const [next, setNext] = useState<string | null>(null), [count, setCount] = useState(initialOrders.length), [activeCount, setActiveCount] = useState(0), [selected, setSelected] = useState('')
  const sequence = useRef(0)
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('order'); if (id) setSelected(id) }, [])
  const refresh = useCallback(async () => {
    const version = ++sequence.current
    try {
      const url = new URL(apiUrl, window.location.origin)
      url.searchParams.set('history', String(history)); if (cursor) url.searchParams.set('cursor', cursor); if (selected) url.searchParams.set('id', selected)
      const response = await fetch(url, { cache: 'no-store' }), result = await response.json()
      if (!response.ok || !Array.isArray(result.orders)) throw new Error(result.error || 'Orders could not be refreshed.')
      if (version !== sequence.current) return
      setNext(result.next_cursor); setCount(result.total); setActiveCount(result.active_count)
      setOrders(result.orders); setError('')
    } catch (err) { if (version === sequence.current) setError(err instanceof Error ? err.message : 'Connection lost. Your current orders are still shown.') }
  }, [apiUrl, history, cursor, selected])
  useEffect(() => {
    if (demoMode) return
    const activeRefresh = () => { if (!document.hidden) void refresh() }
    void refresh()
    const timer = setInterval(activeRefresh, 5000)
    window.addEventListener('online', activeRefresh); document.addEventListener('visibilitychange', activeRefresh)
    return () => { clearInterval(timer); window.removeEventListener('online', activeRefresh); document.removeEventListener('visibilitychange', activeRefresh); ++sequence.current }
  }, [demoMode, refresh])
  async function update(order: ServiceOrder, status: string, cancellationReason = '') {
    if (demoMode || !editable) return
    setBusy(order.id); setError('')
    try {
      const response = await fetch(apiUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: order.id, version: order.version, status, reason: cancellationReason }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Order could not be updated.')
      setOrders(current => current.map(item => item.id === order.id ? { ...item, ...result.order } : item)); setCancelId(''); setReason('')
      await refresh()
    } catch (err) { await refresh(); setError(err instanceof Error ? err.message : 'Order update failed. Please retry.') }
    finally { setBusy('') }
  }
  function selectHistory(value: boolean) { setHistory(value); setCursor(null); setStack([]); setSelected('') }
  return <>
    {!demoMode && <div className="orders-livebar"><span>Updates every 5 seconds · {activeCount} active orders</span><button type="button" onClick={() => void refresh()}>Refresh orders</button><span>Workspace alerts are available in Notifications.</span></div>}
    {!demoMode && <div className="notification-controls"><div role="group" aria-label="Order list"><button aria-pressed={!history} onClick={() => selectHistory(false)}>Active orders</button><button aria-pressed={history} onClick={() => selectHistory(true)}>Completed &amp; cancelled</button></div><span>{selected ? 'Selected order' : `${count} orders · ${history ? 'newest' : 'oldest'} first`}</span>{selected && <button onClick={() => selectHistory(false)}>Show all active orders</button>}</div>}
    {error && <p role="alert" className="pos-alert">{error}</p>}
    <div className="orders-list">{demoMode && <p className="dashboard-sample-note">Sample order data · changes are disabled</p>}{orders.length ? orders.map(order => <article className="order-card" key={order.id}>
      <header><div><span>#{order.order_number}</span><h2>{order.customer_name}</h2><small>{new Date(order.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</small></div><b>{formatCurrency(order.total, order.currency)}</b></header>
      <div className="order-items">{order.order_items.map((item,index) => <span key={index}>{item.quantity} × {item.dish_name}</span>)}</div>{order.customer_note && <p className="order-note">{order.customer_note}</p>}
      <footer><span>{order.customer_phone || 'No phone provided'}</span><select aria-label={`Status for order ${order.order_number}`} disabled={demoMode || !editable || busy === order.id || !ORDER_TRANSITIONS[order.status]?.length} value={order.status} onChange={event => { if (event.target.value === 'cancelled') { setCancelId(order.id); setReason('') } else void update(order,event.target.value) }}>{[order.status,...(ORDER_TRANSITIONS[order.status] || [])].map(status => <option key={status} value={status}>{status[0].toUpperCase()+status.slice(1)}</option>)}</select></footer>
      {cancelId === order.id && <form className="orders-cancel-form" onSubmit={event => { event.preventDefault(); void update(order,'cancelled',reason) }}><label>Cancellation reason<input required minLength={3} maxLength={300} value={reason} onChange={event => setReason(event.target.value)} /></label><button disabled={busy === order.id}>Confirm cancellation</button><button type="button" onClick={() => setCancelId('')}>Keep order</button></form>}
    </article>) : <div className="menu-empty"><b>No orders yet.</b><p>New orders will appear automatically.</p></div>}</div>
    {!demoMode && !selected && <nav className="notification-controls" aria-label="Order pagination"><button disabled={!stack.length} onClick={() => { setCursor(stack.at(-1) || null); setStack(stack.slice(0, -1)) }}>Previous page</button><span>Page {stack.length + 1} · up to 50 orders per page</span><button disabled={!next} onClick={() => { setStack([...stack, cursor]); setCursor(next) }}>Next page</button>{cursor && <button onClick={() => { setCursor(null); setStack([]) }}>First page</button>}</nav>}
  </>
}
