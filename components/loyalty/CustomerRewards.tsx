'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import type { LoyaltyProgram, LoyaltyWallet } from '@/lib/loyalty'
import { loyaltyDate, rewardStatus, walletProgress } from '@/lib/loyalty'
import { formatCurrency } from '@/lib/currency'
import StampCard, { StampGlyph } from './StampCard'

type CardResponse = { program: LoyaltyProgram; authenticated: boolean; wallet: LoyaltyWallet | null; phoneReady: boolean }
export default function CustomerRewards({ restaurant, initialProgram }: { restaurant: { name: string; slug: string; logo_url?: string; currency: string }; initialProgram: LoyaltyProgram }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<CardResponse | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [sent, setSent] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [qr, setQr] = useState('')
  const [showCounter, setShowCounter] = useState(false)
  const program = data?.program || initialProgram
  const wallet = data?.wallet
  const ready = wallet?.rewards.filter(reward => rewardStatus(reward) === 'ready') || []

  async function refresh(background = false) {
    if (!background) { setLoading(true); setError('') }
    try {
      const response = await fetch(`/api/loyalty/card?slug=${encodeURIComponent(restaurant.slug)}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not load your card.')
      setData(result)
    } catch (cause) { if (!background) setError(cause instanceof Error ? cause.message : 'Could not load rewards.') }
    finally { if (!background) setLoading(false) }
  }
  useEffect(() => {
    if (!open) return
    dialog.current?.showModal()
    void refresh()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(true) }, 30000)
    return () => clearInterval(timer)
  }, [open])
  useEffect(() => {
    if (!sent) return
    const update = () => setSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)))
    update(); const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [sent, resendAt])
  useEffect(() => {
    let active = true
    if (wallet?.member.card_code) {
      // Scanning opens the authenticated restaurant counter screen; this is not a login token.
      const url = `${window.location.origin}/dashboard/loyalty?member=${wallet.member.card_code}`
      QRCode.toDataURL(url, { width: 220, margin: 2, errorCorrectionLevel: 'M' }).then(value => { if (active) setQr(value) }).catch(() => {})
    } else setQr('')
    return () => { active = false }
  }, [wallet?.member.card_code])

  async function action(path: string, body: object) {
    setBusy(true); setError('')
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Please try again.')
      return result
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Please try again.'); return null }
    finally { setBusy(false) }
  }
  async function authenticate(event: FormEvent) {
    event.preventDefault()
    const result = await action('/api/loyalty/auth', { action: sent ? 'verify' : 'send', phone, code, slug: restaurant.slug })
    if (!result) return
    if (sent) { setCode(''); await refresh() } else { setSent(true); setResendAt(Date.now() + 60000) }
  }
  async function join(event: FormEvent) {
    event.preventDefault()
    const result = await action('/api/loyalty/card', { slug: restaurant.slug, name })
    if (result) await refresh()
  }

  return <>
    <div className="customer-rewards-bar"><span><StampGlyph icon={program.stamp_icon} /> A little more to look forward to.</span><button type="button" onClick={() => setOpen(true)}>My rewards <span aria-hidden="true">↗</span></button></div>
    {open && <dialog ref={dialog} className="loyalty-dialog" aria-labelledby="rewards-title" onClose={() => { setOpen(false); setShowCounter(false) }} onClick={event => { if (event.target === dialog.current) dialog.current?.close() }}>
      <div className="loyalty-dialog-inner"><header className="loyalty-dialog-header"><div><small>{restaurant.name}</small><h1 id="rewards-title">Your little perks.</h1></div><button className="loyalty-icon-button" type="button" onClick={() => dialog.current?.close()} aria-label="Close rewards">×</button></header>
      <StampCard program={program} restaurantName={restaurant.name} logoUrl={restaurant.logo_url} stamps={wallet ? walletProgress(wallet) : 0} state={wallet ? 'collecting' : 'guest'} expiry={wallet?.member.progress_expires_at ? `Progress ${Date.parse(wallet.member.progress_expires_at) <= Date.now() ? 'expired' : 'expires'} ${loyaltyDate(wallet.member.progress_expires_at)}` : undefined} />
      {error && <div className="loyalty-error" role="alert">{error}<button type="button" onClick={() => void refresh()}>Reload card</button></div>}
      {loading && !data ? <p role="status" className="loyalty-helper">Loading your rewards…</p> : data && <>
        {!program.enabled && <p className="loyalty-notice">New stamps are paused. Rewards you already earned remain available until their expiry date.</p>}
        {wallet ? <div className="loyalty-wallet">
          <div className="loyalty-wallet-heading"><span>Hi, {wallet.member.display_name}</span><button className="loyalty-text-button" disabled={loading || busy} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh card'}</button></div>
          {ready.map(reward => <article className="loyalty-ready-reward" key={reward.id}><span className="loyalty-reward-spark">✦</span><div><small>READY FOR YOU</small><h3>{reward.reward_name}</h3><p>Use by {loyaltyDate(reward.expires_at)}</p></div><button className="loyalty-button" onClick={() => setShowCounter(true)}>Show at counter</button></article>)}
          {!showCounter ? <button className="loyalty-button loyalty-button--outline loyalty-full" onClick={() => setShowCounter(true)}>Show my card at the counter</button> : <section className="loyalty-member-code" aria-label="Your membership code">{qr && <img src={qr} alt="Your membership QR code for the restaurant counter" width={190} height={190} />}<strong>{wallet.member.card_code.match(/.{1,4}/g)?.join(' ')}</strong><p>Show this after paying to collect a stamp, or to redeem an available reward.</p><small>This code identifies your card. Scanning it does not add stamps.</small></section>}
          <details className="loyalty-details"><summary>My activity</summary>{wallet.stamps.length ? wallet.stamps.slice(0, 15).map(stamp => <div className="loyalty-history-row" key={stamp.id}><div><b>{stamp.status === 'reversed' ? 'Stamp reversed' : 'Purchase stamp'}</b><small>{loyaltyDate(stamp.created_at)}</small></div><span>{stamp.status === 'available' && wallet.member.progress_expires_at && Date.parse(wallet.member.progress_expires_at) <= Date.now() ? 'expired' : stamp.status === 'consumed' ? 'Used for reward' : stamp.status}</span></div>) : <p>Your first qualifying purchase starts your card.</p>}{wallet.rewards.filter(reward => rewardStatus(reward) !== 'ready').slice(0, 10).map(reward => <div className="loyalty-history-row" key={reward.id}><b>{reward.reward_name}</b><span>{rewardStatus(reward)}</span></div>)}</details>
        </div> : data.authenticated ? <form className="loyalty-form" onSubmit={join}><h3>Make yourself a regular.</h3><label>Your name<input value={name} onChange={event => setName(event.target.value)} autoComplete="given-name" required minLength={2} maxLength={60} /></label><p className="loyalty-helper">Joining means you agree to the reward rules below.</p><button className="loyalty-button loyalty-full" disabled={busy || !program.enabled}>{busy ? 'Creating your card…' : 'Join rewards'}</button></form> : data.phoneReady ? <form className="loyalty-form" onSubmit={authenticate}><h3>{sent ? 'Check your messages.' : 'Your next favourite visit starts here.'}</h3><p>Verify your phone to keep your stamps between visits.</p><label>Phone number<input type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phone} onChange={event => setPhone(event.target.value)} required maxLength={24} disabled={sent || busy} /></label>{sent && <label>Six-digit code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} /></label>}<button className="loyalty-button loyalty-full" disabled={busy}>{busy ? 'Please wait…' : sent ? 'Verify phone' : 'Send me a code'}</button>{sent && <div className="loyalty-inline-actions"><button type="button" disabled={busy} className="loyalty-text-button" onClick={() => { setSent(false); setCode(''); setError('') }}>Change number</button><button type="button" disabled={busy || seconds > 0} className="loyalty-text-button" onClick={async () => { if (await action('/api/loyalty/auth', { action: 'send', phone, slug: restaurant.slug })) setResendAt(Date.now() + 60000) }}>{seconds > 0 ? `Resend in ${seconds}s` : 'Resend code'}</button></div>}</form> : <p className="loyalty-notice">Phone sign-in is being set up. Please check back soon.</p>}
        <details className="loyalty-details"><summary>How rewards work</summary><ul><li>One stamp per paid bill{program.minimum_spend > 0 ? ` of ${formatCurrency(program.minimum_spend, restaurant.currency)} or more` : ''}. Show your card after paying.</li><li>{program.stamp_target} stamps unlock {program.reward_name.toLowerCase()}.</li><li>Unfinished progress expires after {program.inactivity_days} days without a qualifying purchase. Each qualifying purchase restarts that countdown.</li><li>An unlocked reward expires after {program.reward_valid_days} days. New purchases do not extend its expiry.</li><li>Free reward items do not earn stamps. Refunded purchases may have their stamps reversed.</li><li>Your stamps are for {restaurant.name} only.</li></ul></details>
        {data.authenticated && <button className="loyalty-text-button loyalty-signout" disabled={busy} onClick={async () => { if (await action('/api/loyalty/auth', { action: 'signout' })) { setData(null); setSent(false); setShowCounter(false); await refresh() } }}>Sign out of rewards</button>}
      </>}
      </div>
    </dialog>}
  </>
}
