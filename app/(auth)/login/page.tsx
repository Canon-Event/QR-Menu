'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { IconArrowRight } from '@/components/marketing/Icons'

const supabase = createSupabaseBrowserClient()

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (!cooldown) return
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  async function sendCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    })
    setBusy(false)
    if (authError) {
      setError(authError.message)
      return
    }
    setStep('code')
    setCooldown(30)
    setMessage('We sent a verification code to your email.')
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const { error: authError } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (authError) {
      setError('That code is invalid or expired. Request a new one and try again.')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="auth-page">
      <div className="auth-decoration auth-decoration-one" />
      <div className="auth-decoration auth-decoration-two" />
      <section className="auth-card" aria-labelledby="auth-title">
        <Link href="/" className="auth-brand"><span className="brand-mark">✧</span> QR MENU</Link>
        <div className="auth-heading"><p className="dashboard-kicker">Owner access</p><h1 id="auth-title">Welcome back</h1><p>Sign in to manage your digital menu.</p></div>
        {step === 'email' ? (
          <form onSubmit={sendCode} className="auth-form">
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@restaurant.com" autoComplete="email" required />
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Sending code...' : 'Continue with email OTP'} <IconArrowRight className="h-4 w-4" /></button>
            <p className="auth-note">We’ll email you a secure one-time code. No password to remember.</p>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="auth-form">
            <label htmlFor="code">Verification code</label>
            <input id="code" className="auth-code-input" type="text" inputMode="numeric" pattern="[0-9]{6,8}" minLength={6} maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="00000000" autoComplete="one-time-code" required />
            <button className="auth-submit" type="submit" disabled={busy || code.length < 6}>{busy ? 'Verifying...' : 'Verify and sign in'} <IconArrowRight className="h-4 w-4" /></button>
            <div className="auth-secondary"><button type="button" onClick={() => { setStep('email'); setCode(''); setMessage('') }}>Use a different email</button><button type="button" disabled={cooldown > 0 || busy} onClick={sendCode}>{cooldown ? `Resend in ${cooldown}s` : 'Resend code'}</button></div>
          </form>
        )}
        {message && <p className="auth-message" role="status">{message}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <p className="auth-footer">New to QR Menu? <Link href="/register">Create your account</Link></p>
      </section>
    </main>
  )
}
