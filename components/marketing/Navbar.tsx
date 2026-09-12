'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import ThemeToggle from '@/components/ui/ThemeToggle'

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'Features', href: '/#features' },
  { label: 'Pricing', href: '/plans' },
  { label: 'Contact', href: '/contact' },
]

export default function Navbar({
  active,
  ctaLabel,
  ctaHref,
  ctaVariant = 'dark',
}: {
  active: string
  ctaLabel: string
  ctaHref: string
  ctaVariant?: 'dark' | 'brand'
}) {
  const supabase = createSupabaseBrowserClient()
  const [email, setEmail] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus() }
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [menuOpen])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (active) setEmail(data.session?.user.email ?? null)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setEmail(session?.user.email ?? null)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  return (
    <header className="marketing-navbar">
      <Link href="/" className="flex items-center gap-2">
        <img src="/assets/brand/logo-lockup.svg" alt="FlavorBox" className="h-7 w-auto" />
      </Link>

      <nav aria-label="Main navigation" className="marketing-desktop-nav">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className={
              link.label === active
                ? 'text-ink underline decoration-brand-500 decoration-2 underline-offset-8'
                : 'transition hover:text-ink'
            }
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="navbar-account-actions">
        <ThemeToggle />
        {email ? (
          <Link href="/dashboard" className="navbar-profile-link" title={`Open dashboard for ${email}`} aria-label="Open dashboard">
            <span>{email.slice(0, 2).toUpperCase()}</span>
          </Link>
        ) : (
          <Link href="/login" className="navbar-login-link">Sign in</Link>
        )}
        <Link
          href={email ? '/dashboard' : ctaHref}
          className={ctaVariant === 'brand' ? 'button-primary px-5 py-2.5 text-xs' : 'button-dark px-5 py-2.5 text-xs'}
        >
          {email ? 'Open dashboard' : ctaLabel}
        </Link>
        <button ref={menuButton} type="button" className="marketing-menu-toggle" aria-expanded={menuOpen} aria-controls="marketing-mobile-nav" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMenuOpen(!menuOpen)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={menuOpen ? 'M6 6l12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16'} /></svg>
        </button>
      </div>
      <nav id="marketing-mobile-nav" aria-label="Mobile navigation" className="marketing-mobile-nav" hidden={!menuOpen}>
        {NAV_LINKS.map(link => <Link key={link.label} href={link.href} aria-current={active === link.label ? 'page' : undefined} onClick={() => setMenuOpen(false)}>{link.label}</Link>)}
        <Link href={email ? '/dashboard' : '/login'} onClick={() => setMenuOpen(false)}>{email ? 'Open dashboard' : 'Sign in'}</Link>
        <Link href={email ? '/dashboard' : ctaHref} className="button-dark" onClick={() => setMenuOpen(false)}>{email ? 'Open dashboard' : ctaLabel}</Link>
      </nav>
    </header>
  )
}
