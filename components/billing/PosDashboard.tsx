'use client'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { defaultPosSettings, indiaDate, money, paise, type Bill, type PosSettings } from '@/lib/pos'
import Receipt from './Receipt'

type Order = { id: string; order_number: number; customer_name: string; customer_note: string; status: string; bill_id: string | null; visit_id: string | null; total: number; items: { name: string; quantity: number }[] }
type Table = { id: string; name: string; seats: number; visit: null | { id: string; guest_name: string; opened_at: string } }
type Ticket = { id: string; order_number: number; customer_name: string; customer_note: string; state: string; version: number; created_at: string; lines: { name: string; quantity: number }[] }
type Report = Record<string, any>
export type State = { settings: PosSettings | null; bills: Bill[]; orders: Order[]; tables: Table[]; kitchen: Ticket[]; report: Report; gatewayReady: boolean; restaurantId: string }
type Dish = { id: string; name: string; price: number }
type Mutate = (action: string, data: Record<string, unknown>) => Promise<any | null>
const allTabs = ['Bills', 'Tables', 'Kitchen', 'Daily close', 'Settings']

export default function PosDashboard({ restaurant, dishes, initialTab, apiUrl = '/api/billing', role = 'owner' }: { restaurant: { id: string; name: string; address?: string; currency: string }; dishes: Dish[]; initialTab?: string; apiUrl?: string; role?: string }) {
  const tabs = allTabs.filter(t => t !== 'Settings' || role === 'owner').filter(t => t !== 'Daily close' || ['owner','manager'].includes(role)).filter(t => t !== 'Kitchen' || ['owner','manager'].includes(role))
  const canRefund = ['owner','manager'].includes(role)
  const [tab, setTab] = useState(tabs.find(t => t.toLowerCase() === initialTab?.toLowerCase()) || 'Bills')
  const [data, setData] = useState<State | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true)
  const [date, setDate] = useState(indiaDate()), [selected, setSelected] = useState<Bill | null>(null)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const directBill = useRef<string | null>(null)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('bill')
    if (!id || directBill.current === id) return
    directBill.current = id
    let active = true
    const url = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}bill=${encodeURIComponent(id)}`
    void fetch(url, { cache: 'no-store' }).then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error); if (active) { setSelected(value.bill); setTab('Bills') } }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Bill unavailable.') })
    return () => { active = false; directBill.current = null }
  }, [apiUrl])
  const loadVersion = useRef(0), currentDate = useRef(date)
  currentDate.current = date
  const [orderIds, setOrderIds] = useState<string[]>([]), [items, setItems] = useState<{ dish_id: string; quantity: number }[]>([])
  const [customer, setCustomer] = useState({ customer_name: '', customer_address: '', customer_gstin: '', note: '' }), [discount, setDiscount] = useState('0'), [preview, setPreview] = useState<any>(null)
  const issueKey = useRef(''), keys = useRef(new Map<string, string>())
  const [cash, setCash] = useState(''), [refund, setRefund] = useState({ payment_id: '', amount: '', reason: '' }), [voidReason, setVoidReason] = useState('')
  const load = useCallback(async () => {
    if (currentDate.current !== date) return
    const version = ++loadVersion.current
    try {
      const response = await fetch(`${apiUrl}${apiUrl.includes('?') ? '&' : '?'}date=${date}`, { cache: 'no-store' }), result = await response.json()
      if (version !== loadVersion.current || currentDate.current !== date) return
      if (!response.ok) { if (response.status === 403) { setData(null); setSelected(null) }; throw new Error(result.error || 'Could not load billing.') }
      setData(result)
      const selectedId = selectedRef.current?.id
      let refreshed: Bill | null = selectedId ? result.bills.find((b: Bill) => b.id === selectedId) || null : null
      if (selectedId && !refreshed) {
        const exact = await fetch(`${apiUrl}${apiUrl.includes('?') ? '&' : '?'}bill=${encodeURIComponent(selectedId)}`, { cache: 'no-store' }), value = await exact.json()
        if (version !== loadVersion.current || currentDate.current !== date) return
        if (!exact.ok) { setSelected(current => current?.id === selectedId ? null : current); throw new Error(value.error || 'Bill unavailable.') }
        refreshed = value.bill
      }
      setSelected(current => current?.id === selectedId ? refreshed : current)
      setError('')
    } catch (err) { if (version === loadVersion.current && currentDate.current === date) setError(err instanceof Error ? err.message : 'Could not load billing.') }
    finally { if (version === loadVersion.current && currentDate.current === date) setLoading(false) }
  }, [date, apiUrl])
  useEffect(() => { void load(); const timer = setInterval(() => { if (!document.hidden) void load() }, 10_000); return () => clearInterval(timer) }, [load])
  useEffect(() => { setPreview(null) }, [orderIds, items, customer, discount])
  const mutate: Mutate = async (action, payload) => {
    setBusy(true); setError(''); setNotice('')
    const identity = JSON.stringify([action, payload]); let requestKey = keys.current.get(identity)
    if (!requestKey) { requestKey = crypto.randomUUID(); keys.current.set(identity, requestKey) }
    try {
      const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data: { ...payload, request_key: payload.request_key || requestKey } }) })
      const result = await response.json()
      if (!response.ok) { if (response.status < 500) keys.current.delete(identity); throw new Error(result.error || 'Could not save this action.') }
      if (response.status !== 202) keys.current.delete(identity)
      await load()
      if (result.notice) setNotice(result.notice)
      return result.result
    } catch (err) { await load(); setError(err instanceof Error ? err.message : 'Could not save this action.'); return null }
    finally { setBusy(false) }
  }
  const availableOrders = data?.orders.filter(o => !o.bill_id && o.status !== 'cancelled') || []
  function billPayload() { return { ...customer, customer_gstin: customer.customer_gstin.trim().toUpperCase(), order_ids: orderIds, items, discount_paise: paise(discount || '0') } }
  async function createBill(event: FormEvent) {
    event.preventDefault()
    try {
      issueKey.current ||= crypto.randomUUID()
      const bill = await mutate('issue', { ...billPayload(), request_key: issueKey.current })
      if (bill) { setSelected(bill); setItems([]); setOrderIds([]); setPreview(null); issueKey.current = ''; setNotice(`Invoice ${bill.invoice_number} issued.`) }
    } catch (err) { setError(err instanceof Error ? err.message : 'Check the bill details.') }
  }
  function tableBill(table: Table) {
    const orders = availableOrders.filter(o => o.visit_id === table.visit?.id)
    setOrderIds(orders.map(o => o.id)); setCustomer({ customer_name: table.visit?.guest_name || '', customer_address: '', customer_gstin: '', note: table.name }); setItems([]); setSelected(null); setTab('Bills')
  }
  function exportReport() {
    if (!data) return
    const rows = Object.entries(data.report).filter(([key, value]) => key !== 'closing' && typeof value !== 'object').map(([key, value]) => `${key},${String(value)}`)
    const url = URL.createObjectURL(new Blob([`metric,value\n${rows.join('\n')}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `billing-${date}.csv`; link.click(); URL.revokeObjectURL(url)
  }
  return <main className="pos-app">
    <header className="pos-header pos-no-print"><div><p className="pos-eyebrow">{restaurant.name}</p><h1>Billing & restaurant operations</h1><p>Orders, kitchen progress and payments, each with a clear record.</p></div><Link href={role === 'owner' ? '/dashboard/orders' : '/staff'}>View orders →</Link></header>
    <nav className="pos-tabs pos-no-print" aria-label="Billing sections">{tabs.map(t => <button type="button" key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => { setTab(t); setSelected(null); setNotice('') }}>{t}</button>)}</nav>
    <div className="pos-no-print" aria-live="polite">{error && <p className="pos-alert" role="alert">{error}</p>}{notice && <p className="pos-notice" role="status">{notice}</p>}{loading && <p>Loading your workspace…</p>}</div>
    {!loading && !data && <section className="pos-panel pos-no-print"><h2>Activate billing for this workspace</h2><p>Ask your workspace administrator to run the billing database migration, then refresh this page. Your existing menus and orders continue to work.</p><button onClick={() => void load()}>Refresh</button></section>}
    {data && <>
      {!data.settings?.enabled && tab !== 'Settings' && <section className="pos-panel pos-no-print"><h2>Billing is switched off</h2><p>Set up your outlet’s billing details before creating invoices. Existing invoices and payment records remain accessible.</p>{role === 'owner' && <button onClick={() => setTab('Settings')}>Open billing settings</button>}</section>}
      {tab === 'Bills' && !selected && <div className="pos-grid pos-no-print">
        <section className="pos-panel"><p className="pos-eyebrow">01 / New bill</p><h2>Bring the order together.</h2><form onSubmit={createBill}><fieldset disabled={busy || !data.settings?.enabled}>
          <details open><summary>Include existing orders</summary><div className="pos-order-picker">{availableOrders.length ? availableOrders.map(order => <label className="pos-choice" key={order.id}><input type="checkbox" checked={orderIds.includes(order.id)} onChange={event => setOrderIds(current => event.target.checked ? [...current, order.id] : current.filter(id => id !== order.id))} /><span><b>#{order.order_number} · {order.customer_name}</b><small>{order.items.map(i => `${i.quantity} × ${i.name}`).join(', ')}</small></span><span>{money(Math.round(Number(order.total) * 100))}</span></label>) : <p className="pos-small">No unbilled orders. You can add dishes below.</p>}</div></details>
          <label>Add a dish<select value="" onChange={event => { if (event.target.value) setItems(current => [...current, { dish_id: event.target.value, quantity: 1 }]) }}><option value="">Choose from your menu</option>{dishes.map(dish => <option key={dish.id} value={dish.id}>{dish.name} · {money(Math.round(Number(dish.price) * 100))}</option>)}</select></label>
          {items.map((item, index) => <div className="pos-item-editor" key={index}><span>{dishes.find(d => d.id === item.dish_id)?.name}</span><label>Quantity<input type="number" min={1} max={99} value={item.quantity} onChange={event => setItems(current => current.map((i, n) => n === index ? { ...i, quantity: Number(event.target.value) } : i))} /></label><button type="button" aria-label={`Remove ${dishes.find(d => d.id === item.dish_id)?.name}`} onClick={() => setItems(current => current.filter((_, n) => n !== index))}>Remove</button></div>)}
          <div className="pos-fields"><label>Guest / business name<input maxLength={100} value={customer.customer_name} onChange={e => setCustomer({ ...customer, customer_name: e.target.value })} /></label><label>Discount (₹)<input inputMode="decimal" value={discount} onChange={e => setDiscount(e.target.value)} /></label></div>
          <details><summary>Business invoice and notes</summary><label>Recipient GSTIN<input maxLength={15} value={customer.customer_gstin} onChange={e => setCustomer({ ...customer, customer_gstin: e.target.value.toUpperCase() })} /></label><label>Recipient address<textarea maxLength={500} value={customer.customer_address} onChange={e => setCustomer({ ...customer, customer_address: e.target.value })} /></label><label>Bill note<textarea maxLength={500} value={customer.note} onChange={e => setCustomer({ ...customer, note: e.target.value })} /></label></details>
          <div className="pos-actions"><button type="button" disabled={!orderIds.length && !items.length} onClick={async () => { try { const result = await mutate('preview', billPayload()); if (result) setPreview(result) } catch (err) { setError(err instanceof Error ? err.message : 'Check the bill.') } }}>Preview total</button><button className="pos-primary" disabled={!preview} type="submit">Issue invoice</button></div>
          {preview && <div className="pos-preview"><span>Calculated total</span><strong>{money(preview.total_paise)}</strong><small>GST: {money(Number(preview.cgst_paise) + Number(preview.state_tax_paise))} · {preview.price_mode === 'inclusive' ? 'Tax included in menu prices' : 'Tax added to menu prices'}</small></div>}
          <p className="pos-small">Issued invoices keep their original prices and tax details. Corrections to paid purchases use refunds and credit notes.</p>
        </fieldset></form></section>
        <section className="pos-panel"><p className="pos-eyebrow">02 / Issued invoices</p><h2>Every bill accounted for.</h2><p className="pos-small">Most recent 100 invoices. Daily reports include all records.</p><div className="pos-bill-list">{data.bills.length ? data.bills.map(bill => <button type="button" className="pos-bill-row" key={bill.id} onClick={() => { setSelected(bill); setCash(''); setRefund({ payment_id: '', amount: '', reason: '' }) }}><span><b>{bill.invoice_number}</b><small>{bill.customer.name} · {new Date(bill.issued_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</small></span><span><b>{money(bill.total_paise)}</b><small>{Number(bill.overpaid_paise) > 0 ? 'Overpayment to refund' : Number(bill.credited_paise) === Number(bill.total_paise) ? 'Credited' : Number(bill.balance_paise) === 0 ? 'Paid' : `Due ${money(bill.balance_paise)}`}</small></span></button>) : <p>No invoices issued yet.</p>}</div></section>
      </div>}
      {tab === 'Bills' && selected && <div className="pos-grid"><div><div className="pos-actions pos-no-print"><button onClick={() => setSelected(null)}>← All bills</button><button onClick={() => window.print()}>Print / save PDF</button><Link href={`/bill/${selected.public_token}`} target="_blank" rel="noreferrer">Open customer bill ↗</Link></div><Receipt bill={selected} token={selected.public_token} /></div><section className="pos-panel pos-no-print"><h2>Payment record</h2>{Number(selected.overpaid_paise) > 0 && <p className="pos-alert">Overpayment of {money(selected.overpaid_paise)} needs refunding.</p>}{selected.payments.map(p => <div className="pos-ledger-row" key={p.id}><span>{p.method === 'cash' ? 'Cash' : 'Online · verified'}<small>{new Date(p.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</small></span><b>{money(p.amount_paise)}</b></div>)}{selected.refunds.map(f => <div className="pos-ledger-row" key={f.id}><span>Refund · {f.state}<small>{f.reason}</small></span><b>−{money(f.amount_paise)}</b></div>)}
        {canRefund && Number(selected.paid_paise) === 0 && Number(selected.balance_paise) > 0 && <form onSubmit={async e => { e.preventDefault(); if (await mutate('void', { bill_id: selected.id, reason: voidReason })) setVoidReason('') }}><h3>Correct an unpaid invoice</h3><label>Reason for full credit<input required minLength={3} maxLength={300} value={voidReason} onChange={e => setVoidReason(e.target.value)} /></label><button disabled={busy}>Issue full credit note</button><p className="pos-small">The original invoice is preserved. Its orders become available for a corrected bill.</p></form>}
        {Number(selected.balance_paise) > 0 && <form onSubmit={async event => { event.preventDefault(); try { if (await mutate('cash', { bill_id: selected.id, amount_paise: paise(cash) })) setCash('') } catch (err) { setError(err instanceof Error ? err.message : 'Check the amount.') } }}><h3>Record cash received</h3><label>Cash applied to bill (₹)<input inputMode="decimal" required value={cash} onChange={event => setCash(event.target.value)} /></label><button disabled={busy} type="submit">Record cash</button><p className="pos-small">Use the customer bill link for automatically verified UPI and card payments.</p></form>}
        {canRefund && selected.payments.length > 0 && <form onSubmit={async event => { event.preventDefault(); try { const result = await mutate('refund', { payment_id: refund.payment_id, amount_paise: paise(refund.amount), reason: refund.reason }); if (result) setRefund({ payment_id: '', amount: '', reason: '' }) } catch (err) { setError(err instanceof Error ? err.message : 'Check the refund.') } }}><h3>Refund a purchase</h3><label>Original payment<select required value={refund.payment_id} onChange={e => setRefund({ ...refund, payment_id: e.target.value })}><option value="">Choose payment</option>{selected.payments.map(p => <option key={p.id} value={p.id}>{p.method} · {money(p.amount_paise)}</option>)}</select></label><label>Refund amount (₹)<input required inputMode="decimal" value={refund.amount} onChange={e => setRefund({ ...refund, amount: e.target.value })} /></label><label>Reason<textarea required minLength={3} maxLength={300} value={refund.reason} onChange={e => setRefund({ ...refund, reason: e.target.value })} /></label><button disabled={busy} type="submit">Request refund</button><p className="pos-small">Online refunds are confirmed by the provider. Record a cash refund after handing the cash back.</p></form>}
      </section></div>}
      {tab === 'Tables' && <Tables data={data} busy={busy} mutate={mutate} billTable={tableBill} canCreate={['owner','manager'].includes(role)} />}
      {tab === 'Kitchen' && <Kitchen data={data} busy={busy} mutate={mutate} />}
      {tab === 'Daily close' && <section className="pos-panel pos-no-print"><div className="pos-section-heading"><div><p className="pos-eyebrow">Cash & tax</p><h2>A clear end to the day.</h2></div><label>Business date (IST)<input type="date" max={indiaDate()} value={date} onChange={e => setDate(e.target.value)} /></label><button onClick={exportReport}>Export summary CSV</button></div><div className="pos-metrics">{[['Invoices issued', data.report.invoice_count], ['Invoice value', money(data.report.invoiced_paise)], ['Cash received', money(data.report.cash_paise)], ['Online received', money(data.report.online_paise)], ['Refunds processed', money(data.report.refunds_paise)], ['Credit notes', money(data.report.credits_paise)], ['Net taxable value', money(Number(data.report.taxable_paise) - Number(data.report.credited_taxable_paise))], ['Net CGST', money(Number(data.report.cgst_paise) - Number(data.report.credited_cgst_paise))], ['Net state tax', money(Number(data.report.state_tax_paise) - Number(data.report.credited_state_tax_paise))]].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div><p className="pos-small">Payments are reported when received; refunds when confirmed. Figures cover this billing module. Tax credits may relate to older invoices.</p><CashClosing report={data.report} date={date} mutate={mutate} busy={busy} /></section>}
      {tab === 'Settings' && <Settings initial={{ ...defaultPosSettings, legal_name: restaurant.name, address: restaurant.address || '', ...data.settings }} gatewayReady={data.gatewayReady} restaurantId={data.restaurantId} busy={busy} mutate={mutate} currency={restaurant.currency} />}
    </>}
  </main>
}

export function Tables({ data, busy, mutate, billTable, canCreate = true }: { data: State; busy: boolean; mutate: Mutate; billTable?: (table: Table) => void; canCreate?: boolean }) {
  const [name, setName] = useState(''), [seats, setSeats] = useState(2), [guest, setGuest] = useState('')
  return <div className="pos-no-print"><section className="pos-panel"><h2>The floor, at a glance.</h2>{canCreate && <form className="pos-inline-form" onSubmit={async event => { event.preventDefault(); if (await mutate('table_create', { name, seats })) setName('') }}><label>New table name<input required maxLength={40} value={name} onChange={e => setName(e.target.value)} /></label><label>Seats<input type="number" min={1} max={40} value={seats} onChange={e => setSeats(Number(e.target.value))} /></label><button disabled={busy || !data.settings?.enabled}>Add table</button></form>}<label>Guest name for a new visit<input maxLength={100} value={guest} onChange={e => setGuest(e.target.value)} placeholder="Optional" /></label></section><div className="pos-table-grid">{data.tables.map(table => {
    const visit = table.visit, orders = data.orders.filter(o => o.visit_id === visit?.id)
    return <section className={`pos-panel pos-table ${visit ? 'pos-occupied' : ''}`} key={table.id}><span className="pos-badge">{visit ? 'Occupied' : 'Available'}</span><h3>{table.name}</h3><p>{table.seats} seats{visit ? ` · ${visit.guest_name}` : ''}</p>{visit ? <><p className="pos-small">{orders.length} orders · Since {new Date(visit.opened_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}</p>{orders.map(o => <div className="pos-small" key={o.id}>#{o.order_number} · {o.bill_id ? 'Invoiced' : 'Unbilled'}</div>)}<label>Add an order<select disabled={busy} value="" onChange={e => { if (e.target.value) void mutate('visit_assign', { visit_id: visit.id, order_id: e.target.value }) }}><option value="">Choose unassigned order</option>{data.orders.filter(o => !o.visit_id && !o.bill_id && o.status !== 'cancelled').map(o => <option value={o.id} key={o.id}>#{o.order_number} · {o.customer_name}</option>)}</select></label><label>Move visit<select disabled={busy} value="" onChange={e => { if (e.target.value) void mutate('visit_transfer', { visit_id: visit.id, table_id: e.target.value }) }}><option value="">Choose available table</option>{data.tables.filter(t => !t.visit).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><div className="pos-actions">{billTable && <button onClick={() => billTable(table)}>Build table bill</button>}<button disabled={busy} onClick={() => void mutate('visit_close', { visit_id: visit.id })}>Close visit</button></div></> : <button disabled={busy || !data.settings?.enabled} onClick={() => void mutate('visit_open', { table_id: table.id, guest_name: guest })}>Seat guests</button>}</section>
  })}</div></div>
}

export function Kitchen({ data, busy, mutate }: { data: State; busy: boolean; mutate: Mutate }) {
  const [reason, setReason] = useState(''), [cancel, setCancel] = useState<string | null>(null), [, tick] = useState(0)
  useEffect(() => { const timer = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(timer) }, [])
  return <section className="pos-no-print"><div className="pos-panel"><h2>Keep service moving.</h2><p>New phone orders join this queue when kitchen tickets are enabled. Kitchen progress is separate from order and payment status.</p><label>Send an existing order<select value="" disabled={busy || !data.settings?.enabled || !data.settings?.kitchen_enabled} onChange={e => { if (e.target.value) void mutate('kitchen_send', { order_id: e.target.value }) }}><option value="">Choose order</option>{data.orders.filter(o => o.status !== 'cancelled' && !data.kitchen.some(k => k.order_number === o.order_number)).map(o => <option key={o.id} value={o.id}>#{o.order_number} · {o.customer_name}</option>)}</select></label>{!data.settings?.kitchen_enabled && <p className="pos-small">Enable kitchen tickets in Billing settings.</p>}</div><div className="pos-kitchen-grid">{['queued', 'preparing', 'ready', 'served'].map((state, stage) => <section className="pos-kitchen-column" key={state}><h3>{state[0].toUpperCase() + state.slice(1)}</h3>{data.kitchen.filter(k => k.state === state).map(ticket => <article className="pos-panel" key={ticket.id}><div className="pos-section-heading"><b>#{ticket.order_number}</b><small>{Math.max(0, Math.floor((Date.now() - Date.parse(ticket.created_at)) / 60000))} min</small></div><p>{ticket.customer_name}</p>{ticket.lines.map((line, n) => <p key={n}><b>{line.quantity} ×</b> {line.name}</p>)}{ticket.customer_note && <p className="pos-note">{ticket.customer_note}</p>}{stage < 3 && <button className="pos-primary" disabled={busy} onClick={() => void mutate('kitchen_move', { ticket_id: ticket.id, version: ticket.version, state: ['preparing', 'ready', 'served'][stage] })}>{['Start preparing', 'Mark ready', 'Mark served'][stage]}</button>}{stage < 2 && <><button className="pos-text-button" onClick={() => { setCancel(ticket.id); setReason('') }}>Cancel ticket</button>{cancel === ticket.id && <form onSubmit={async e => { e.preventDefault(); if (await mutate('kitchen_move', { ticket_id: ticket.id, version: ticket.version, state: 'cancelled', reason })) setCancel(null) }}><label>Cancellation reason<input required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /></label><button disabled={busy}>Confirm cancellation</button><p className="pos-small">This cancels kitchen preparation. Any issued bill needs a separate correction.</p></form>}</>}</article>)}</section>)}</div></section>
}

function CashClosing({ report, date, mutate, busy }: { report: Report; date: string; mutate: Mutate; busy: boolean }) {
  const [opening, setOpening] = useState('0'), [counted, setCounted] = useState(''), [note, setNote] = useState('')
  const [error, setError] = useState('')
  if (report.closing) return <div className="pos-preview"><h3>Cash closing recorded</h3><p>Expected {money(report.closing.expected_paise)} · Counted {money(report.closing.counted_paise)} · Difference {money(Number(report.closing.counted_paise) - Number(report.closing.expected_paise))}</p><p>{report.closing.note}</p><p className="pos-small">Closing is a saved snapshot. Later receipts and refunds still appear in the live daily totals above.</p></div>
  return <form onSubmit={async event => { event.preventDefault(); setError(''); try { await mutate('close_day', { date, opening_paise: paise(opening), counted_paise: paise(counted), note }) } catch (err) { setError(err instanceof Error ? err.message : 'Check the amounts.') } }}><h3>Count the cash drawer</h3><div className="pos-fields"><label>Opening cash (₹)<input required inputMode="decimal" value={opening} onChange={e => setOpening(e.target.value)} /></label><label>Counted cash (₹)<input required inputMode="decimal" value={counted} onChange={e => setCounted(e.target.value)} /></label></div><label>Closing note<textarea maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>{error && <p role="alert">{error}</p>}<button disabled={busy}>Save cash closing</button></form>
}

function Settings({ initial, gatewayReady, restaurantId, busy, mutate, currency }: { initial: PosSettings; gatewayReady: boolean; restaurantId: string; busy: boolean; mutate: Mutate; currency: string }) {
  const [form, setForm] = useState(initial), [saved, setSaved] = useState(false)
  return <div className="pos-grid pos-no-print"><section className="pos-panel"><h2>Set up your outlet.</h2><p>For in-person restaurant-service billing in INR. Confirm your tax classification with your accountant.</p>{currency !== 'INR' && <p className="pos-alert">This outlet uses {currency}. Billing currently supports INR.</p>}<form onSubmit={async e => { e.preventDefault(); setSaved(false); if (await mutate('settings', form)) setSaved(true) }}><fieldset disabled={busy || currency !== 'INR'}><label className="pos-check"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />Enable billing & tables</label><label className="pos-check"><input type="checkbox" checked={form.kitchen_enabled} onChange={e => setForm({ ...form, kitchen_enabled: e.target.checked })} />Automatically create kitchen tickets for new orders</label><label>Legal business name<input required maxLength={120} value={form.legal_name} onChange={e => setForm({ ...form, legal_name: e.target.value })} /></label><label>Outlet address<textarea required maxLength={500} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></label><div className="pos-fields"><label>State code<input required pattern="[0-9]{2}" maxLength={2} value={form.state_code} onChange={e => setForm({ ...form, state_code: e.target.value })} /></label><label>Service accounting code<input required pattern="[0-9]{6}" maxLength={6} value={form.sac} onChange={e => setForm({ ...form, sac: e.target.value })} /></label></div><label>GST registration<select value={form.tax_status} onChange={e => setForm({ ...form, tax_status: e.target.value as PosSettings['tax_status'] })}><option value="unregistered">Unregistered · no GST collected</option><option value="composition">Composition · bill of supply</option><option value="regular">Regular GST registration</option></select></label>{form.tax_status !== 'unregistered' && <label>GSTIN<input required maxLength={15} value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase() })} /></label>}{form.tax_status === 'regular' && <label>Restaurant classification<select value={form.restaurant_class} onChange={e => setForm({ ...form, restaurant_class: e.target.value as PosSettings['restaurant_class'] })}><option value="standard">Outside specified premises · 5% without ITC</option><option value="specified">At specified premises · 18%</option></select></label>}<label>Menu prices<select value={form.price_mode} onChange={e => setForm({ ...form, price_mode: e.target.value as PosSettings['price_mode'] })}><option value="inclusive">Include applicable GST</option><option value="exclusive">Exclude applicable GST</option></select></label><button className="pos-primary">Save billing settings</button>{saved && <p role="status">Billing settings saved.</p>}</fieldset></form></section><section className="pos-panel"><p className="pos-eyebrow">Online payments</p><h2>{gatewayReady ? 'Restaurant account connected.' : 'Connect a payment account.'}</h2><p>Customers pay through the restaurant’s own Razorpay account. Payments are confirmed automatically by the provider.</p><p className="pos-small">Account credentials are configured securely by your deployment administrator. They are separate from your WIIT subscription payments.</p><label>Restaurant reference<input readOnly value={restaurantId} /></label><label>Webhook path<input readOnly value={`/api/payments/razorpay/webhook/${restaurantId}`} /></label><p className="pos-small">The setup guide explains test payments, automatic capture and webhook configuration. Never enter API secrets in bill notes or customer forms.</p></section></div>
}
