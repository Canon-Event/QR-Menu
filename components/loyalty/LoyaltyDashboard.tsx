'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Restaurant } from '@/types'
import { defaultLoyaltyProgram, loyaltyDate, normalizeCardCode, rewardStatus, walletProgress, type LoyaltyProgram, type LoyaltyWallet } from '@/lib/loyalty'
import { formatCurrency } from '@/lib/currency'
import StampCard, { StampGlyph } from './StampCard'

type Tab = 'appearance' | 'rules' | 'counter' | 'activity'
type Stats = { members: number; stamps: number; ready: number; redeemed: number }
type Activity = { id: string; action: string; note?: string; created_at: string; loyalty_members: { display_name: string } | null }
export default function LoyaltyDashboard({ restaurant, phoneReady, initialMember = '' }: { restaurant: Restaurant; phoneReady: boolean; initialMember?: string }) {
  const defaults = defaultLoyaltyProgram(restaurant.id, restaurant.template_settings?.[restaurant.template]?.primaryColor)
  const [program, setProgram] = useState<LoyaltyProgram>(defaults)
  const [saved, setSaved] = useState<LoyaltyProgram | null>(null)
  const [tab, setTab] = useState<Tab>(initialMember ? 'counter' : 'appearance')
  const [preview, setPreview] = useState<'guest' | 'collecting' | 'ready'>('collecting')
  const [stats, setStats] = useState<Stats | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [rulesLocked, setRulesLocked] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [memberCode, setMemberCode] = useState(initialMember)
  const [wallet, setWallet] = useState<LoyaltyWallet | null>(null)
  const [billReference, setBillReference] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [reverseId, setReverseId] = useState('')
  const [reason, setReason] = useState('')
  const [confirmReward, setConfirmReward] = useState('')
  const request = useRef<{ fingerprint: string; key: string } | null>(null)
  const dirty = JSON.stringify(program) !== JSON.stringify(saved || defaults)

  async function loadOverview(initial = false) {
    setLoadError('')
    try {
      const response = await fetch('/api/loyalty/manage', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not load loyalty.')
      setStats(result.stats); setActivity(result.activity || []); setRulesLocked(result.rulesLocked); setLoaded(true)
      setSaved(result.program)
      if (initial) setProgram(result.program || defaults)
    } catch (cause) { setLoadError(cause instanceof Error ? cause.message : 'Could not load loyalty.'); setLoaded(false) }
  }
  useEffect(() => { void loadOverview(true); if (initialMember) void findMember(initialMember) }, [])
  function update<K extends keyof LoyaltyProgram>(key: K, value: LoyaltyProgram[K]) { setProgram(current => ({ ...current, [key]: value })); setMessage(''); setError('') }

  async function mutate(body: Record<string, unknown>) {
    setBusy(true); setError(''); setMessage('')
    const fingerprint = JSON.stringify(body)
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() }
    try {
      const response = await fetch('/api/loyalty/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, requestKey: request.current.key }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not save your changes.')
      request.current = null
      return result
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Please try again.'); return null }
    finally { setBusy(false) }
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    const result = await mutate({ action: 'save', program })
    if (result) { setProgram(result.program); setSaved(result.program); setMessage(result.program.enabled ? 'Saved. Your rewards card is live on the menu.' : 'Draft saved. Activate it in Program rules when you’re ready.'); await loadOverview() }
  }
  async function findMember(value: string) {
    const code = normalizeCardCode(value)
    setError(''); setMessage(''); setWallet(null); setConfirmReward(''); setReverseId(''); setBillReference(''); setPaidAmount('')
    if (!code) { setError('Enter the 12-character code shown on the customer’s card.'); return }
    setBusy(true)
    try {
      const response = await fetch(`/api/loyalty/manage?member=${code}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Card not found.')
      setWallet(result)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load this card.') }
    finally { setBusy(false) }
  }
  async function refreshWallet() {
    if (!wallet) return
    const response = await fetch(`/api/loyalty/manage?member=${wallet.member.card_code}`, { cache: 'no-store' })
    if (response.ok) setWallet(await response.json())
    else setError('The action was saved, but the card could not refresh. Look up the card again to see its latest balance.')
  }
  async function counterAction(body: Record<string, unknown>, success: string) {
    const result = await mutate(body)
    if (!result) return false
    setMessage(result.duplicate ? 'This action was already saved. No duplicate was added.' : success)
    try { await Promise.all([refreshWallet(), loadOverview()]) } catch { setError('The action was saved. Reload the card to see the latest balance.') }
    return true
  }

  return <main className="loyalty-workspace">
    <header className="loyalty-page-header"><div><p className="loyalty-eyebrow">YOUR RESTAURANT · YOUR REGULARS</p><h1>A little loyalty goes a long way.</h1><p>Create a card they’ll love coming back to.</p></div><div className="loyalty-header-actions"><a className="loyalty-button loyalty-button--outline" href={`/menu/${restaurant.slug}`} target="_blank" rel="noreferrer">Open menu ↗</a>{(tab === 'appearance' || tab === 'rules') && <button className="loyalty-button" form="loyalty-settings" disabled={busy || !loaded}>{busy ? 'Saving…' : saved ? 'Save changes' : 'Save stamp card'}</button>}</div></header>
    <div className="loyalty-stats">{([['members', 'Members', 'People who joined'], ['stamps', 'Stamps earned', 'Qualifying purchases'], ['ready', 'Rewards ready', 'A reason to return'], ['redeemed', 'Rewards enjoyed', 'Little moments, counted']] as const).map(([key, label, hint]) => <article key={key}><span>{label}</span><strong>{stats ? (stats[key] || 0).toLocaleString('en-IN') : '—'}</strong><small>{hint}</small></article>)}</div>
    <div className="loyalty-tab-bar" role="tablist" aria-label="Loyalty workspace">{([['appearance', 'Card appearance'], ['rules', 'Program rules'], ['counter', 'At the counter'], ['activity', 'Activity']] as const).map(([key, label]) => <button key={key} id={`loyalty-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="loyalty-panel" onClick={() => { setTab(key); setError(''); setMessage('') }}>{label}</button>)}<span className={`loyalty-status ${saved?.enabled ? 'is-live' : ''}`}>{saved?.enabled ? '● Live' : '○ Draft / paused'}{dirty && ' · Unsaved changes'}</span></div>
    {loadError && <div className="loyalty-error" role="alert">{loadError}<button type="button" onClick={() => void loadOverview(true)}>Try again</button></div>}
    {error && <p className="loyalty-error" role="alert">{error}</p>}
    {message && <p className="loyalty-success" role="status">{message}</p>}
    <section id="loyalty-panel" role="tabpanel" aria-labelledby={`loyalty-tab-${tab}`}>
    {(tab === 'appearance' || tab === 'rules') && <form id="loyalty-settings" onSubmit={save} className="loyalty-editor-grid"><div className="loyalty-editor-fields">
      {tab === 'appearance' ? <>
        <section className="loyalty-panel"><div className="loyalty-section-heading"><span>01</span><div><h2>Start with a feeling.</h2><p>One familiar card. Three ways to make it yours.</p></div></div><div className="loyalty-presets">{(['minimal', 'paper', 'bold'] as const).map(style => <button type="button" key={style} aria-pressed={program.card_style === style} onClick={() => update('card_style', style)} className={`loyalty-preset ${program.card_style === style ? 'is-selected' : ''}`}><span className={`loyalty-preset-art loyalty-preset-art--${style}`}><i /><span>● ● ● ○ ○</span></span><strong>{style[0].toUpperCase() + style.slice(1)}</strong><small>{style === 'minimal' ? 'Clean & considered' : style === 'paper' ? 'Warm & familiar' : 'Confident & colourful'}</small></button>)}</div></section>
        <section className="loyalty-panel"><div className="loyalty-section-heading"><span>02</span><div><h2>Make it feel like you.</h2><p>Your restaurant logo is used automatically.</p></div></div><div className="loyalty-form"><label>Card title<input value={program.title} maxLength={60} required onChange={event => update('title', event.target.value)} /><small>A short welcome for your regulars.</small></label><div className="loyalty-two-columns"><label>Accent colour<div className="loyalty-colour"><input type="color" value={program.accent_color} onChange={event => update('accent_color', event.target.value)} aria-label="Accent colour" /><span>{program.accent_color.toUpperCase()}</span></div></label><label>Card background<div className="loyalty-colour"><input type="color" value={program.background_color} disabled={program.card_style === 'bold'} onChange={event => update('background_color', event.target.value)} aria-label="Card background" /><span>{program.card_style === 'bold' ? 'Uses accent colour' : program.background_color.toUpperCase()}</span></div></label></div><label>Type style<select value={program.card_font} onChange={event => update('card_font', event.target.value as LoyaltyProgram['card_font'])}><option value="classic">Classic — elegant serif</option><option value="modern">Modern — clean and simple</option><option value="friendly">Friendly — soft and rounded</option></select></label><fieldset className="loyalty-icon-choices"><legend>Stamp icon</legend>{(['coffee', 'star', 'utensils'] as const).map(icon => <button type="button" key={icon} aria-pressed={program.stamp_icon === icon} onClick={() => update('stamp_icon', icon)}><StampGlyph icon={icon} /><span>{icon === 'utensils' ? 'Dining' : icon === 'coffee' ? 'Coffee' : 'Star'}</span></button>)}</fieldset></div></section>
        <p className="loyalty-editor-note">Text colour adjusts automatically to keep your card readable.</p>
      </> : <>
        <section className="loyalty-panel"><div className="loyalty-section-heading"><span>01</span><div><h2>A reward worth returning for.</h2><p>Start simple: one stamp for each qualifying paid bill.</p></div></div>{rulesLocked && <p className="loyalty-notice">Customers have joined. These rules are locked to protect the rewards they were promised. You can still change the card’s appearance or pause new stamps.</p>}<fieldset disabled={rulesLocked} className="loyalty-form"><label>Reward name<input required value={program.reward_name} maxLength={100} onChange={event => update('reward_name', event.target.value)} placeholder="A complimentary coffee" /></label><div className="loyalty-two-columns"><label>Stamps to earn it<input type="number" min={3} max={12} required value={program.stamp_target} onChange={event => update('stamp_target', Number(event.target.value))} /></label><label>Minimum paid bill ({restaurant.currency})<input type="number" min={0} max={1000000} step="0.01" required value={program.minimum_spend} onChange={event => update('minimum_spend', Number(event.target.value))} /></label></div><p className="loyalty-helper">A minimum of 0 means any paid purchase qualifies. A free reward by itself earns no stamp.</p><div className="loyalty-two-columns"><label>Progress expires after<input type="number" min={30} max={365} required value={program.inactivity_days} onChange={event => update('inactivity_days', Number(event.target.value))} /><small>Days without a qualifying purchase</small></label><label>Reward valid for<input type="number" min={7} max={180} required value={program.reward_valid_days} onChange={event => update('reward_valid_days', Number(event.target.value))} /><small>Days from when it unlocks</small></label></div></fieldset></section>
        <section className="loyalty-panel"><div className="loyalty-section-heading"><span>02</span><div><h2>How customers earn.</h2><p>Payment comes first. The stamp follows.</p></div></div><div className="loyalty-method"><span>✓</span><div><h3>Counter purchases</h3><p>Look up the customer’s card, enter the paid bill, and give one stamp.</p></div><small>Available</small></div><div className="loyalty-method"><span>↗</span><div><h3>Automatic after in-app payment</h3><p>Needs customer checkout payments to be connected. Placing an order currently earns no stamp.</p></div><small>Not connected</small></div></section>
        <section className="loyalty-panel"><label className="loyalty-toggle"><div><strong>Activate rewards on your menu</strong><p>Allow customers to join and earn stamps.</p></div><input type="checkbox" checked={program.enabled} disabled={!phoneReady && !program.enabled} onChange={event => update('enabled', event.target.checked)} /></label>{!phoneReady && <p className="loyalty-notice">Phone sign-in needs setup before activation. You can save and preview your card now. See docs/stamp-card-guide.md for the steps.</p>}<p className="loyalty-helper">Pausing stops new enrollments and stamps. Existing rewards can still be redeemed until they expire.</p></section>
      </>}
    </div><aside className="loyalty-preview"><div className="loyalty-preview-label"><span>LIVE PREVIEW</span><small>Updates as you edit</small></div><div className="loyalty-preview-device"><div className="loyalty-preview-top"><span>{restaurant.name}</span><span>Rewards ✦</span></div><StampCard program={program} restaurantName={restaurant.name} logoUrl={restaurant.logo_url} stamps={preview === 'collecting' ? Math.min(3, program.stamp_target - 1) : 0} state={preview}><div className="stamp-card-demo-cta">{preview === 'guest' ? 'Join rewards' : preview === 'ready' ? 'Show at counter' : 'View menu'} <span>↗</span></div></StampCard><p className="loyalty-preview-caption">A little thank you for choosing {restaurant.name}.</p></div><div className="loyalty-preview-states" aria-label="Preview card state">{([['guest', 'New guest'], ['collecting', 'Collecting'], ['ready', 'Reward ready']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={preview === value} onClick={() => setPreview(value)}>{label}</button>)}</div><p className="loyalty-helper">Preview only · These are example stamps.</p></aside></form>}
    {tab === 'counter' && <div className="loyalty-counter-grid"><section className="loyalty-panel"><p className="loyalty-eyebrow">A SMALL THANK YOU, IN A FEW TAPS</p><h2>Find their card.</h2><p className="loyalty-helper">Scan the customer’s QR with your phone camera to open this screen, or enter their card code below.</p><form className="loyalty-form" onSubmit={event => { event.preventDefault(); void findMember(memberCode) }}><label>Customer card code<input value={memberCode} onChange={event => setMemberCode(event.target.value)} placeholder="A1B2 C3D4 E5F6" maxLength={250} autoComplete="off" required /></label><button className="loyalty-button" disabled={busy || !loaded}>{busy ? 'Please wait…' : 'Find card'}</button></form><div className="loyalty-counter-tip"><StampGlyph icon="star" /><p>The customer joins rewards on your menu first. Their card belongs to them, and works only at your restaurant.</p></div></section>
      {wallet && saved ? <div className="loyalty-counter-card"><StampCard program={saved} restaurantName={restaurant.name} logoUrl={restaurant.logo_url} stamps={walletProgress(wallet)} /><section className="loyalty-panel"><div className="loyalty-wallet-heading"><div><h2>{wallet.member.display_name}</h2><p className="loyalty-helper">Phone ending {wallet.member.phone_last4} · {wallet.member.card_code}</p></div></div><form className="loyalty-form" onSubmit={async event => { event.preventDefault(); if (await counterAction({ action: 'award', memberId: wallet.member.id, billReference, paidAmount: Number(paidAmount) }, 'One stamp added. The customer can refresh their card.')) { setBillReference(''); setPaidAmount('') } }}><div className="loyalty-two-columns"><label>Unique bill reference<input value={billReference} onChange={event => setBillReference(event.target.value)} required minLength={2} maxLength={80} placeholder="2026-10-25 / 1042" /><small>Include the date if bill numbers repeat daily.</small></label><label>Amount paid ({restaurant.currency})<input type="number" value={paidAmount} onChange={event => setPaidAmount(event.target.value)} required min={Math.max(0.01, Number(saved.minimum_spend))} max={1000000} step="0.01" placeholder="250.00" /></label></div><button className="loyalty-button" disabled={busy || !saved.enabled}>{busy ? 'Saving…' : saved.enabled ? 'Give 1 stamp' : 'New stamps are paused'}</button><p className="loyalty-helper">Use this after receiving payment. Each bill can earn one stamp.</p></form></section>
      {wallet.rewards.filter(reward => rewardStatus(reward) === 'ready').map(reward => <section className="loyalty-panel loyalty-counter-reward" key={reward.id}><small>REWARD READY</small><h3>{reward.reward_name}</h3><p>Expires {loyaltyDate(reward.expires_at)}</p>{confirmReward === reward.id ? <div className="loyalty-confirm"><p>Hand over the reward, then confirm. This marks it as used.</p><div className="loyalty-inline-actions"><button className="loyalty-button" disabled={busy} onClick={async () => { if (await counterAction({ action: 'redeem', rewardId: reward.id }, 'Reward marked as redeemed.')) setConfirmReward('') }}>Confirm redemption</button><button className="loyalty-text-button" disabled={busy} onClick={() => setConfirmReward('')}>Cancel</button></div></div> : <button className="loyalty-button loyalty-button--outline" disabled={busy} onClick={() => setConfirmReward(reward.id)}>Redeem reward</button>}</section>)}
      <section className="loyalty-panel"><h3>Recent purchases</h3>{wallet.stamps.length === 0 && <p className="loyalty-helper">No stamps yet. Their first paid purchase starts here.</p>}{wallet.stamps.slice(0, 12).map(stamp => <div key={stamp.id} className="loyalty-purchase"><div><strong>{stamp.bill_reference}</strong><small>{formatCurrency(stamp.paid_amount, restaurant.currency)} · {loyaltyDate(stamp.created_at)} · {stamp.status}</small></div>{stamp.status !== 'reversed' && <button className="loyalty-text-button" disabled={busy} onClick={() => { setReverseId(stamp.id); setReason('') }}>Reverse</button>}{reverseId === stamp.id && <form className="loyalty-form loyalty-reverse-form" onSubmit={async event => { event.preventDefault(); if (await counterAction({ action: 'reverse', stampId: stamp.id, reason }, 'Stamp reversed and reward eligibility updated.')) setReverseId('') }}><label>Reason<input required minLength={3} maxLength={200} value={reason} onChange={event => setReason(event.target.value)} placeholder="Purchase refunded" /></label><div className="loyalty-inline-actions"><button className="loyalty-button" disabled={busy}>Confirm reversal</button><button type="button" className="loyalty-text-button" onClick={() => setReverseId('')}>Cancel</button></div></form>}</div>)}</section></div> : <div className="loyalty-counter-empty"><StampGlyph icon={program.stamp_icon} /><h2>A familiar face. A little perk.</h2><p>Find a customer’s card to give a stamp or redeem their reward.</p></div>}
    </div>}
    {tab === 'activity' && <section className="loyalty-panel"><div className="loyalty-section-heading"><span>↗</span><div><h2>Little moments, all accounted for.</h2><p>The latest 20 stamp awards, reversals and reward redemptions.</p></div></div>{activity.length === 0 ? <div className="loyalty-empty"><StampGlyph icon="star" /><h3>Your story with regulars starts here.</h3><p>Activity will appear after your first customer earns a stamp.</p></div> : <div className="loyalty-table-wrap"><table className="loyalty-table"><thead><tr><th>Customer</th><th>Activity</th><th>Reference / reason</th><th>Date</th></tr></thead><tbody>{activity.map(item => <tr key={item.id}><td>{item.loyalty_members?.display_name || 'Member'}</td><td>{item.action === 'award' ? 'Stamp awarded' : item.action === 'redeem' ? 'Reward redeemed' : 'Stamp reversed'}</td><td>{item.note || '—'}</td><td>{loyaltyDate(item.created_at)}</td></tr>)}</tbody></table></div>}</section>}
    </section>
  </main>
}
