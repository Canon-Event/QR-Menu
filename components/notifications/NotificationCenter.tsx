'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { NOTIFICATION_CATEGORIES, notificationDescription, notificationHref, notificationTitle, type InboxItem, type NotificationFeed, type NotificationSettings } from '@/lib/notifications'
import { pushSupported } from '@/lib/notification-push-client'
import { useNotifications } from './NotificationProvider'

export function NotificationBell() {
  const notifications = useNotifications(), dialog = useRef<HTMLDialogElement>(null), button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  if (!notifications) return null
  const count = notifications.feed?.unread || 0
  function close() { dialog.current?.close(); setOpen(false); button.current?.focus() }
  return <>
    <button ref={button} type="button" className="notification-bell" aria-label={`Notifications${count ? `, ${count} unread` : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(true); dialog.current?.showModal() }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 22h4" /></svg>
      {count > 0 && <span className="notification-badge">{count > 99 ? '99+' : count}</span>}
    </button>
    <dialog className="notification-dialog" ref={dialog} aria-label="Notification center" onCancel={close} onClick={event => { if (event.target === dialog.current) close() }}>
      {open && <div className="notification-panel"><header><h2>Notifications</h2><button autoFocus type="button" onClick={close} aria-label="Close notifications">×</button></header><NotificationCenter onNavigate={close} /><Link className="notification-history-link" href={notifications.ownerView ? '/dashboard/notifications' : `/staff/${notifications.restaurantId}/notifications`} onClick={close}>Open full history and preferences →</Link></div>}
    </dialog>
  </>
}

export default function NotificationCenter({ full = false, onNavigate }: { full?: boolean; onNavigate?: () => void }) {
  const context = useNotifications()
  const [filter, setFilter] = useState<'all' | 'unread'>('all'), [history, setHistory] = useState<InboxItem[]>([]), [more, setMore] = useState(false), [loading, setLoading] = useState(false), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const [before, setBefore] = useState<string | null>(null), [pages, setPages] = useState<(string | null)[]>([])
  const feed = context?.feed, restaurantId = context?.restaurantId
  useEffect(() => {
    generation.current++
    if (!restaurantId || !feed) { setHistory([]); setMore(false); return }
    if (filter === 'all' && !before) { setMore(feed.items.length > 50); setLoading(false); return }
    const current = generation.current, controller = new AbortController()
    setLoading(true)
    fetch(`/api/notifications?restaurant=${restaurantId}&unread=${filter === 'unread'}${before ? `&before=${before}` : ''}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const value = await response.json(); if (!response.ok) throw new Error(value.error)
      if (generation.current === current) { setHistory(value.items.slice(0, 50)); setMore(value.items.length > 50) }
    }).catch(error => { if (error.name !== 'AbortError' && generation.current === current) setMessage(error.message) }).finally(() => { if (generation.current === current) setLoading(false) })
    return () => controller.abort()
  }, [filter, before, feed, restaurantId])
  if (!context) return <p>Choose a restaurant workspace to view notifications.</p>
  const items = !feed ? [] : filter === 'all' && !before ? feed.items.slice(0, 50) : history
  const unique = [...new Map(items.map(item => [item.id, item])).values()]
  async function act(action: () => Promise<void>) { setBusy(true); setMessage(''); try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : 'Please try again.') } finally { setBusy(false) } }
  function loadMore() {
    const cursor = unique.at(-1)?.cursor; if (!cursor || loading) return
    setPages(previous => [...previous, before].slice(-100)); setBefore(cursor)
  }
  function changeFilter(value: 'all' | 'unread') { setFilter(value); setBefore(null); setPages([]); setHistory([]) }
  return <div className="notification-center">
    <div className="notification-connection" role="status">{context.status}{feed && <> · {feed.unread} unread</>}</div>
    {(context.error || message) && <p className="notification-error" role="alert">{message || context.error} <button type="button" onClick={() => void act(context.refresh)}>Retry</button></p>}
    <div className="notification-controls"><div role="group" aria-label="Notification filter"><button type="button" aria-pressed={filter === 'all'} onClick={() => changeFilter('all')}>All</button><button type="button" aria-pressed={filter === 'unread'} onClick={() => changeFilter('unread')}>Unread</button></div><button type="button" disabled={busy || !feed?.unread} onClick={() => void act(() => context.mutate({ action: 'read_all', cutoff: feed!.head }))}>Mark all as read</button></div>
    {!feed && !context.error ? <p role="status">Loading notifications…</p> : !unique.length && !loading ? <p className="notification-empty">{filter === 'unread' ? 'You’re all caught up.' : 'No notifications yet. New restaurant activity will appear here.'}</p> : null}
    <ol className="notification-list">{unique.map(item => <li key={item.id} className={`notification-item ${item.read_at ? 'is-read' : 'is-unread'} severity-${item.severity}`}>
      <div className="notification-item-heading"><span>{item.severity === 'urgent' ? 'Urgent' : item.severity === 'warning' ? 'Attention' : 'Update'}</span>{!item.read_at && <span className="notification-unread-dot" aria-label="Unread" />}</div>
      <Link href={notificationHref(context.restaurantId, item.id, context.ownerView)} onClick={onNavigate}>{notificationTitle(item)}</Link>
      <p>{notificationDescription(item)}</p><footer><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}</time>{!item.read_at && <button disabled={busy} type="button" onClick={() => void act(() => context.mutate({ action: 'read', id: item.id }))} aria-label={`Mark ${notificationTitle(item)} as read`}>Mark read</button>}</footer>
    </li>)}</ol>
    <nav className="notification-controls" aria-label="Notification pagination">{before && <><button type="button" disabled={loading} onClick={() => { setBefore(pages.at(-1) || null); setPages(pages.slice(0,-1)) }}>Newer notifications</button><button type="button" onClick={() => { setBefore(null); setPages([]) }}>Latest notifications</button></>}{more && <button type="button" onClick={loadMore} disabled={loading}>{loading ? 'Loading…' : 'Older notifications'}</button>}</nav>
    {full && <><NotificationPreferencesPanel /><p className="notification-retention">Notification history is retained for 90 days. Reading an alert does not accept an order or stop its reminders.</p></>}
  </div>
}

function NotificationPreferencesPanel() {
  const context = useNotifications()!, prefs = context.feed?.preferences
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [settings, setSettings] = useState<NotificationSettings | null>(null)
  const dirty = useRef(false)
  useEffect(() => { if (!dirty.current) setSettings(context.feed?.settings || null) }, [context.feed?.settings])
  async function act(fn: () => Promise<void>) { setBusy(true); setMessage(''); try { await fn(); setMessage('Notification preferences saved.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save preferences.') } finally { setBusy(false) } }
  if (!prefs) return null
  return <section className="notification-preferences"><h2>Notification preferences</h2><fieldset disabled={busy}><legend>Sound and background delivery</legend>
    <p>{prefs.sound_enabled ? context.audioReady ? 'Sound is enabled in this tab.' : 'Sound preference saved. Enable playback in this tab to hear alerts.' : 'Sound is off.'}</p>
    <div className="notification-button-row"><button type="button" onClick={() => void act(() => context.enableSound())}>Enable sound in this tab</button><button type="button" onClick={() => void act(() => context.enableSound(true))}>Test sound</button><button type="button" onClick={() => void act(() => context.savePreferences({ ...prefs, sound_enabled: false }))}>Turn sound off</button></div>
    <label>Volume<input aria-label="Notification volume" type="range" min="0" max="1" step="0.05" defaultValue={prefs.volume} key={prefs.volume} onChange={event => { const volume = Number(event.target.value); void act(() => context.savePreferences({ ...prefs, volume })) }} /></label>
    <p>Sound and push categories. Your inbox still retains every authorized alert.</p>
    <div className="notification-category-grid">{NOTIFICATION_CATEGORIES.map(category => <label key={category}><input type="checkbox" checked={prefs.categories.includes(category)} onChange={event => void act(() => context.savePreferences({ ...prefs, categories: event.target.checked ? [...prefs.categories, category] : prefs.categories.filter(c => c !== category) }))} />{category}</label>)}</div>
    <p>{!pushSupported() ? 'This browser does not support background notifications.' : !context.feed?.pushConfigured ? 'Background notifications need deployment configuration.' : prefs.push_enabled ? 'Background notifications are enabled for this restaurant. Enable this device to register another browser.' : 'Allow background notifications to receive alerts when this page is closed.'}</p>
    <div className="notification-button-row"><button type="button" disabled={!pushSupported() || !context.feed?.pushConfigured} onClick={() => void act(context.enablePush)}>Enable background notifications on this device</button><button type="button" onClick={() => void act(context.disablePush)}>Disable background notifications</button></div>
  </fieldset>
    {settings && <form onChange={() => { dirty.current = true }} onSubmit={event => { event.preventDefault(); void act(async () => { await context.saveSettings(settings); dirty.current = false }) }}><h3>Restaurant alert rules</h3><fieldset disabled={busy}><legend>Pending orders and feedback</legend><label><input type="checkbox" checked={settings.reminders_enabled} onChange={event => setSettings({ ...settings, reminders_enabled: event.target.checked })} />Remind staff about pending orders</label>
      {([['first_seconds', 'First reminder (seconds)', 30, 3600], ['escalation_seconds', 'Manager escalation (seconds)', 60, 7200], ['repeat_seconds', 'Repeat interval (seconds)', 60, 7200], ['max_repeats', 'Maximum additional escalations', 0, 5], ['feedback_threshold', 'Alert for ratings at or below', 1, 4]] as const).map(([key, label, min, max]) => <label key={key}>{label}<input type="number" required min={min} max={max} value={settings[key]} onChange={event => setSettings({ ...settings, [key]: Number(event.target.value) })} /></label>)}<button type="submit">Save restaurant alert rules</button></fieldset></form>}
    {message && <p role="status">{message}</p>}
  </section>
}
