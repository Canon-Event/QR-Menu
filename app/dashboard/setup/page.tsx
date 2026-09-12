'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconArrowRight, IconExternalLink } from '@/components/marketing/Icons'

const templates = [
  { id: 'A', name: 'Classic', detail: 'Warm and familiar' },
  { id: 'B', name: 'Minimal', detail: 'Clean and focused' },
  { id: 'C', name: 'Italian', detail: 'Romantic and botanical' },
]

export default function RestaurantSetupPage() {
  const router = useRouter()
  const [ownerName, setOwnerName] = useState('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [template, setTemplate] = useState('A')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function updateName(value: string) {
    setName(value)
    if (!slug) setSlug(value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const response = await fetch('/api/restaurants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ownerName, name, slug, logoUrl, template }) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      setBusy(false)
      setError(result.error || 'Something went wrong. Please try again.')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="setup-page">
      <header className="setup-topbar"><a href="/" className="auth-brand"><span className="brand-mark">✧</span> QR MENU</a><a href="/dashboard" className="setup-exit">Back to dashboard <IconExternalLink className="h-3 w-3" /></a></header>
      <div className="setup-layout">
        <section className="setup-card">
          <div className="setup-heading"><p className="dashboard-kicker">Step 1 of 2 · Restaurant profile</p><h1>Make your menu yours.</h1><p>Set up the basics now. You can update every detail later from your dashboard.</p></div>
          <form className="setup-form" onSubmit={submit}>
            <div className="setup-field"><label htmlFor="owner-name">Your name</label><input id="owner-name" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Saksham Garg" minLength={2} maxLength={100} autoComplete="name" required /><small>This appears in your dashboard welcome message.</small></div>
            <div className="setup-field"><label htmlFor="restaurant-name">Restaurant name</label><input id="restaurant-name" value={name} onChange={(event) => updateName(event.target.value)} placeholder="The Green Bistro" minLength={2} maxLength={100} required /><small>Use the name your guests already know.</small></div>
            <div className="setup-field"><label htmlFor="restaurant-slug">Your menu address</label><div className="slug-input"><span>qrmenu.app/menu/</span><input id="restaurant-slug" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} minLength={3} maxLength={50} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="the-green-bistro" required /></div><small>Lowercase letters, numbers, and hyphens only.</small></div>
            <div className="setup-field"><label htmlFor="logo-url">Logo URL <span>(optional)</span></label><input id="logo-url" type="url" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://your-site.com/logo.png" /><small>Add a public HTTPS image URL for your brand mark.</small></div>
            <fieldset><legend>Choose a menu style</legend><div className="setup-templates">{templates.map((item) => <button type="button" key={item.id} aria-pressed={template === item.id} className={template === item.id ? 'setup-template selected' : 'setup-template'} onClick={() => setTemplate(item.id)}><span className={`setup-template-swatch swatch-${item.id.toLowerCase()}`} /><span><b>{item.name}</b><small>{item.detail}</small></span>{template === item.id && <em>✓</em>}</button>)}</div></fieldset>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Creating restaurant...' : 'Continue to menu setup'} <IconArrowRight className="h-4 w-4" /></button>
          </form>
        </section>
        <aside className="setup-preview-area"><div className="preview-label"><span>Live preview</span><small>Updates as you type</small></div><div className={`menu-device preview-${template.toLowerCase()}`}><div className="device-top"><span>9:41</span><span>•••</span></div><div className="menu-preview-content"><div className="preview-logo">{logoUrl ? <img src={logoUrl} alt="" /> : <span>✧</span>}</div><h2>{name || 'Your restaurant'}</h2><p className="preview-location">DIGITAL MENU</p><div className="preview-rule" /><p className="preview-category">STARTERS</p><div className="preview-dish"><div><b>Seasonal salad</b><small>Fresh, bright and made to order</small></div><strong>₹240</strong></div><div className="preview-dish"><div><b>House special</b><small>A little something delicious</small></div><strong>₹380</strong></div><p className="preview-category second">MAINS</p><div className="preview-dish"><div><b>Chef’s choice</b><small>Ask us about today’s special</small></div><strong>₹520</strong></div></div><div className="device-bottom"><span>⌂</span><span>Menu</span><span>♡</span></div></div><p className="preview-note">A clean, mobile-first menu your guests can open with one scan.</p></aside>
      </div>
    </main>
  )
}
