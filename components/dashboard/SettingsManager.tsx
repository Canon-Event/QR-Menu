'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import type { Restaurant } from '@/types'

type Props = { restaurant: Restaurant; displayName: string; email: string; qrDataUrl: string; initialTab: string }
const tabs = [['restaurant', 'Restaurant'], ['qr', 'QR code'], ['account', 'Account']] as const

async function save(body: object) {
  const response = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Could not save settings.')
  return result
}

export default function SettingsManager({ restaurant: initial, displayName: initialName, email, qrDataUrl, initialTab }: Props) {
  const router = useRouter()
  const [restaurant, setRestaurant] = useState(initial)
  const [tab, setTab] = useState(tabs.some(item => item[0] === initialTab) ? initialTab : 'restaurant')
  const [profile, setProfile] = useState({ name: initial.name, slug: initial.slug, description: initial.description || '', address: initial.address || '', phone: initial.phone || '', logoUrl: initial.logo_url || '', currency: initial.currency || 'INR' })
  const [displayName, setDisplayName] = useState(initialName)
  const [qr, setQr] = useState({ foreground: initial.qr_foreground || '#000000', background: initial.qr_background || '#ffffff', margin: initial.qr_margin ?? 2 })
  const [liveQrDataUrl, setLiveQrDataUrl] = useState(qrDataUrl)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const notify = (kind: 'error' | 'success', text: string) => setMessage({ kind, text })

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      const menuUrl = `${window.location.origin}/menu/${restaurant.slug}`
      QRCode.toDataURL(menuUrl, { width: 400, margin: qr.margin, color: { dark: qr.foreground, light: qr.background } })
        .then(dataUrl => { if (active) setLiveQrDataUrl(dataUrl) })
        .catch(() => { if (active) notify('error', 'Could not preview those QR settings.') })
    }, 60)
    return () => { active = false; window.clearTimeout(timer) }
  }, [qr.foreground, qr.background, qr.margin, restaurant.slug])
  function chooseTab(next: string) { setTab(next); setMessage(null); router.replace(`/dashboard/settings${next === 'restaurant' ? '' : `?tab=${next}`}`, { scroll: false }) }

  async function submitRestaurant(event: FormEvent) {
    event.preventDefault(); setBusy('restaurant'); setMessage(null)
    try { const result = await save({ section: 'restaurant', ...profile }); setRestaurant(result.restaurant); notify('success', 'Restaurant details saved.'); router.refresh() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Could not save details.') } finally { setBusy('') }
  }
  async function chooseTemplate(template: string) {
    setBusy('template'); setMessage(null)
    try { const result = await save({ section: 'template', template }); setRestaurant(result.restaurant); notify('success', 'Menu template updated.'); router.refresh() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Could not change template.') } finally { setBusy('') }
  }
  async function saveQr(event: FormEvent) {
    event.preventDefault(); setBusy('qr'); setMessage(null)
    try { const result = await save({ section: 'qr', ...qr }); setRestaurant(result.restaurant); notify('success', 'QR settings saved.'); router.refresh() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Could not save QR settings.') } finally { setBusy('') }
  }
  async function saveAccount(event: FormEvent) {
    event.preventDefault(); setBusy('account'); setMessage(null)
    try { await save({ section: 'account', displayName }); notify('success', 'Account profile updated.'); router.refresh() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Could not save account.') } finally { setBusy('') }
  }
  async function togglePublishing() {
    setBusy('publishing'); setMessage(null)
    try { const result = await save({ section: 'publishing', isActive: !restaurant.is_active }); setRestaurant(result.restaurant); notify('success', result.restaurant.is_active ? 'Public menu published.' : 'Public menu paused.'); router.refresh() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Could not change publishing status.') } finally { setBusy('') }
  }

  return <main className="settings-page"><header className="settings-header"><div><a href="/dashboard">← Dashboard</a><h1>Settings</h1><p>Manage your restaurant, menu appearance, QR code and account.</p></div><div className="settings-header-actions"><a className="settings-menu-preview" href={`/menu/${restaurant.slug}`} target="_blank" rel="noopener noreferrer">Open live preview ↗</a><div className={`publish-state ${restaurant.is_active ? 'live' : 'paused'}`}><span />{restaurant.is_active ? 'Menu live' : 'Menu paused'}<button disabled={busy === 'publishing'} onClick={togglePublishing}>{restaurant.is_active ? 'Pause' : 'Publish'}</button></div></div></header>
    <div className="settings-shell"><nav className="settings-tabs" aria-label="Settings sections">{tabs.map(([key, label]) => <button className={tab === key ? 'active' : ''} onClick={() => chooseTab(key)} key={key}>{label}</button>)}</nav>{message && <div className={`menu-flash ${message.kind}`} role="status">{message.text}<button aria-label="Dismiss" onClick={() => setMessage(null)}>×</button></div>}
      {tab === 'restaurant' && <form className="settings-card" onSubmit={submitRestaurant}><div className="settings-card-heading"><h2>Restaurant details</h2><p>These details identify your restaurant and appear on the public menu.</p></div><div className="settings-form-grid"><label>Restaurant name<input required minLength={2} maxLength={100} value={profile.name} onChange={event => setProfile({ ...profile, name: event.target.value })} /></label><label>Menu address<div className="settings-slug"><span>/menu/</span><input required minLength={3} maxLength={50} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={profile.slug} onChange={event => setProfile({ ...profile, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /></div></label><label className="full">Short description<textarea maxLength={300} value={profile.description} onChange={event => setProfile({ ...profile, description: event.target.value })} placeholder="Tell guests what makes your restaurant special." /></label><label className="full">Address<input maxLength={250} value={profile.address} onChange={event => setProfile({ ...profile, address: event.target.value })} /></label><label>Phone<input type="tel" maxLength={30} value={profile.phone} onChange={event => setProfile({ ...profile, phone: event.target.value })} /></label><label>Currency<select value={profile.currency} onChange={event => setProfile({ ...profile, currency: event.target.value })}>{['INR','USD','EUR','GBP','AED'].map(currency => <option key={currency}>{currency}</option>)}</select></label><label className="full">Logo URL <span>HTTPS only</span><input type="url" maxLength={2048} value={profile.logoUrl} onChange={event => setProfile({ ...profile, logoUrl: event.target.value })} placeholder="https://example.com/logo.png" /></label></div><div className="settings-actions"><button disabled={busy === 'restaurant'}>{busy === 'restaurant' ? 'Saving…' : 'Save restaurant details'}</button></div></form>}
      {tab === 'templates' && <section className="settings-card"><div className="settings-card-heading"><h2>Menu template</h2><p>Choose how your public menu looks. Content and plan features remain unchanged.</p></div><div className="settings-template-grid">{[{ id: 'A', name: 'Heritage', detail: 'Warm Indian vintage presentation' }, { id: 'B', name: 'Green Bistro', detail: 'Botanical modern restaurant menu' }, { id: 'C', name: 'Italian', detail: 'Romantic Italian botanical presentation' }].map(item => <button disabled={busy === 'template'} className={restaurant.template === item.id ? 'selected' : ''} onClick={() => chooseTemplate(item.id)} key={item.id}><span className={`settings-template-preview preview-${item.id.toLowerCase()}`}><i /><i /><i /></span><b>{item.name}</b><small>{item.detail}</small>{restaurant.template === item.id && <em>Active</em>}</button>)}</div></section>}
      {tab === 'qr' && <form className="settings-card qr-settings-card" onSubmit={saveQr}><div className="settings-card-heading"><h2>QR code settings</h2><p>Changes appear instantly in the preview. Keep strong color contrast so phone cameras can scan reliably.</p></div><div className="qr-settings-layout"><div className="qr-settings-preview"><img src={liveQrDataUrl} alt="Live menu QR code preview" /><b>{restaurant.name}</b><small>Live preview · /menu/{restaurant.slug}</small></div><div className="qr-controls"><label>Foreground color<div><input type="color" value={qr.foreground} onChange={event => setQr({ ...qr, foreground: event.target.value })} /><input pattern="#[0-9a-fA-F]{6}" value={qr.foreground} onChange={event => setQr({ ...qr, foreground: event.target.value })} /></div></label><label>Background color<div><input type="color" value={qr.background} onChange={event => setQr({ ...qr, background: event.target.value })} /><input pattern="#[0-9a-fA-F]{6}" value={qr.background} onChange={event => setQr({ ...qr, background: event.target.value })} /></div></label><label>Quiet-zone margin: {qr.margin}<input type="range" min="0" max="8" step="1" value={qr.margin} onChange={event => setQr({ ...qr, margin: Number(event.target.value) })} /></label><div className="qr-control-actions"><a href={liveQrDataUrl} download={`${restaurant.slug}-qr.png`}>Download preview PNG</a><button disabled={busy === 'qr'}>{busy === 'qr' ? 'Saving…' : 'Save QR settings'}</button></div></div></div></form>}
      {tab === 'account' && <form className="settings-card" onSubmit={saveAccount}><div className="settings-card-heading"><h2>Account settings</h2><p>Update the profile attached to your secure login.</p></div><div className="settings-form-grid"><label>Display name<input required minLength={2} maxLength={100} value={displayName} onChange={event => setDisplayName(event.target.value)} /></label><label>Email address<input value={email} disabled /><span>Email changes require a verified authentication flow.</span></label></div><div className="settings-actions"><button disabled={busy === 'account'}>{busy === 'account' ? 'Saving…' : 'Save account profile'}</button></div></form>}
    </div></main>
}
