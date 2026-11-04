'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import PosDashboard, { Tables, Kitchen, type State } from '@/components/billing/PosDashboard'
import TableAccessPanel from '@/components/staff/TableAccessPanel'
import OrdersBoard from '@/components/dashboard/OrdersBoard'
import { money } from '@/lib/pos'
import { pendingOrder } from '@/lib/order-request'
export default function StaffWorkspace({ initial }: { initial: any }) {
  const [data, setData] = useState<any>(initial), [tab, setTab] = useState(initial.role === 'kitchen' ? 'Kitchen' : 'Orders'), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const rid = initial.restaurant.id, base = `/api/staff?restaurant=${rid}`, billing = `/api/staff/billing?restaurant=${rid}`
  useEffect(() => { const requested = new URLSearchParams(window.location.search).get('tab'); if (requested) setTab(requested) }, [])
  const load = useCallback(async () => {
    try { const r = await fetch(base, { cache: 'no-store' }); const result = await r.json(); if (!r.ok) { if (r.status === 403) setData(null); throw new Error(result.error) }; setData(result); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Workspace could not be refreshed.') }
  }, [base])
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) void load() }, 5000); return () => clearInterval(timer) }, [load])
  async function mutate(action: string, payload: Record<string, unknown>) {
    setBusy(true); setError('')
    try { const r = await fetch(billing, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data: payload }) }); const result = await r.json(); if (!r.ok) throw new Error(result.error); await load(); return result.result }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); return null } finally { setBusy(false) }
  }
  const role = data?.role, tabs = role === 'kitchen' ? ['Kitchen'] : ['Orders','Tables', ...(['cashier','manager','owner'].includes(role) ? ['Billing'] : []), ...(['manager','owner'].includes(role) ? ['Kitchen'] : [])]
  const currentTab = tabs.includes(tab) ? tab : tabs[0]
  return <main className="pos-app"><header className="pos-header"><div><p className="pos-eyebrow">{initial.restaurant.name} · {role || 'Access unavailable'}</p><h1>Service workspace</h1></div><Link href="/staff">All workspaces →</Link></header>{error && <p className="pos-alert" role="alert">{error}</p>}{data && <><nav className="pos-tabs" aria-label="Staff sections">{tabs.map(t => <button key={t} aria-current={currentTab === t ? 'page' : undefined} onClick={() => setTab(t)}>{t}</button>)}</nav>{currentTab === 'Orders' && <><TableAccessPanel restaurantId={rid} /><StaffOrder data={data} base={base} refresh={load} /><OrdersBoard initialOrders={data.orders} apiUrl={`/api/staff/orders?restaurant=${rid}`} /></>}{currentTab === 'Tables' && <Tables data={data as State} busy={busy} mutate={mutate} canCreate={['owner','manager'].includes(role)} />}{currentTab === 'Kitchen' && <Kitchen data={data as State} busy={busy} mutate={mutate} />}{currentTab === 'Billing' && <PosDashboard restaurant={data.restaurant} dishes={data.dishes} apiUrl={billing} role={role} />}</>}</main>
}
function StaffOrder({ data, base, refresh }: { data: any; base: string; refresh: () => Promise<void> }) {
  const [name, setName] = useState('Guest'), [note, setNote] = useState(''), [visitId, setVisit] = useState(''), [dish, setDish] = useState(''), [quantity, setQuantity] = useState(1), [items, setItems] = useState<{ dishId: string; quantity: number }[]>([]), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const pending = useRef<ReturnType<typeof pendingOrder> | undefined>(undefined)
  return <section className="pos-panel"><h2>Take an order</h2><form onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const draft = { slug: `staff:${data.restaurant.id}:${visitId}`, customerName: name, phone: '', note, items }
      let storage: Storage | null = null; try { storage = sessionStorage } catch { /* Retry still works in memory. */ }
      const request = pendingOrder(storage, draft, pending.current); pending.current = request
      const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: request.key, name, note, items, visitId }) }); const result = await r.json(); if (!r.ok) throw new Error(result.error)
      pending.current = undefined; try { storage?.removeItem(`wiit-order:${draft.slug}`) } catch { /* Optional storage. */ }
      setItems([]); setNote(''); setNotice(`Order #${result.result.order_number} sent.`); await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Order could not be sent.') } finally { setBusy(false) }
  }}><fieldset disabled={busy}><div className="pos-fields"><label>Guest name<input required minLength={2} maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label><label>Table visit<select value={visitId} onChange={e => setVisit(e.target.value)}><option value="">Counter / unassigned</option>{data.tables.filter((t: any) => t.visit).map((t: any) => <option key={t.id} value={t.visit.id}>{t.name} · {t.visit.guest_name}</option>)}</select></label></div><div className="pos-fields"><label>Dish<select value={dish} onChange={e => setDish(e.target.value)}><option value="">Choose dish</option>{data.dishes.map((d: any) => <option key={d.id} value={d.id}>{d.name} · {money(Math.round(Number(d.price) * 100))}</option>)}</select></label><label>Quantity<input type="number" min={1} max={99} value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label></div><button type="button" disabled={!dish || !Number.isInteger(quantity) || quantity < 1 || quantity > 99} onClick={() => { setItems([...items,{ dishId: dish, quantity }]); setDish(''); setQuantity(1) }}>Add item</button>{items.map((i,n) => <p key={n}>{i.quantity} × {data.dishes.find((d: any) => d.id === i.dishId)?.name} <button type="button" onClick={() => setItems(items.filter((_,j) => j !== n))}>Remove</button></p>)}<label>Kitchen note<textarea maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label><button className="pos-primary" disabled={!items.length}>Send order</button></fieldset></form>{error && <p className="pos-alert" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}</section>
}
