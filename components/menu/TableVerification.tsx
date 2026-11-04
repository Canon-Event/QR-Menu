'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { UUID } from '@/lib/pos'

type Access = { state: string; code?: string; table_name?: string; reference?: string; expires_at?: string }
export function useTableVerification(slug: string, required: boolean, table: string | null) {
  const [access, setAccess] = useState<Access>({ state: 'loading' }), [error, setError] = useState(''), [busy, setBusy] = useState(false), [retryAt, setRetryAt] = useState(0)
  const nonce = useRef(''), sequence = useRef(0), issuing = useRef(false)
  const read = useCallback(async () => {
    const version = ++sequence.current
    try {
      const r = await fetch(`/api/public/table-access?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' }), data = await r.json()
      if (version !== sequence.current) return
      if (!r.ok) { if (r.status === 429) setRetryAt(Date.now() + Number(r.headers.get('Retry-After') || 60) * 1000); throw new Error(data.error || 'Could not check waiter approval.') }
      setAccess(data); setError('')
    } catch (e) { if (version === sequence.current) { setAccess(a => ({ ...a, state: 'offline' })); setError(e instanceof Error ? e.message : 'Connection unavailable.') } }
  }, [slug])
  const issue = useCallback(async (fresh = false) => {
    if (issuing.current || Date.now() < retryAt || !table || !UUID.test(table)) return
    issuing.current = true; setBusy(true); setError(''); const version = ++sequence.current
    try {
      const key = `wiit-table-scan:${slug}:${table}`
      if (!nonce.current || fresh) {
        let saved = ''; try { saved = sessionStorage.getItem(key) || '' } catch { /* Optional browser storage. */ }
        nonce.current = !fresh && UUID.test(saved) ? saved : crypto.randomUUID()
        try { sessionStorage.setItem(key, nonce.current) } catch { /* In-memory retries remain stable. */ }
      }
      const r = await fetch('/api/public/table-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, table, nonce: nonce.current }) }), data = await r.json()
      if (version !== sequence.current) return
      if (!r.ok) {
        if (r.status === 429) setRetryAt(Date.now() + Number(r.headers.get('Retry-After') || 60) * 1000)
        setAccess({ state: r.status === 410 || r.status === 409 ? 'expired' : 'scan_required' }); throw new Error(data.error || 'Could not prepare your code.')
      }
      setAccess(data)
    } catch (e) { if (version === sequence.current) { setAccess(a => a.state === 'loading' ? { state: 'offline' } : a); setError(e instanceof Error ? e.message : 'Could not prepare your code. Check your connection and try again.') } }
    finally { issuing.current = false; setBusy(false) }
  }, [slug, table, retryAt])
  useEffect(() => {
    if (!required) return
    nonce.current = ''; setAccess({ state: 'loading' })
    if (table && UUID.test(table)) void issue()
    else void read()
    // Avoid duplicate issue requests during React's development effect replay.
    // Poll/status never grants access; SQL and HttpOnly cookies enforce approval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, table, required])
  useEffect(() => {
    if (!required) return
    const refresh = () => { if (!document.hidden && !issuing.current && Date.now() >= retryAt) void read() }
    const timer = setInterval(refresh, 6000)
    window.addEventListener('online', refresh); document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(timer); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [required, read, retryAt])
  const expired = access.expires_at ? Date.parse(access.expires_at) <= Date.now() : false
  return { access, error, busy, retryAt, issue, read, allowed: !required || (access.state === 'approved' && !expired) }
}
export function TableVerification({ verification, canScan }: { verification: ReturnType<typeof useTableVerification>; canScan: boolean }) {
  const { access, error, busy, retryAt, issue, read } = verification
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const left = access.expires_at ? Math.max(0, Math.ceil((Date.parse(access.expires_at) - now) / 1000)) : 0
  const pending = access.state === 'pending' && left > 0, approved = access.state === 'approved' && left > 0
  return <aside className="table-verification" aria-label="Table approval" aria-live="polite">
    <b>{approved ? `${access.table_name} · Phone approved` : pending ? `${access.table_name} · Ask your waiter` : 'Waiter approval required'}</b>
    {pending ? <><p>Show this code to your waiter in person.</p><strong className="table-verification-code" aria-label={`Approval code ${access.code}`}>{access.code}</strong><small>Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} · Ordering unlocks after approval.</small></> : approved ? <p>You can order for this table during your current visit.</p> : <p>{access.state === 'loading' ? 'Preparing your table access…' : canScan ? 'Your phone needs a current approval before placing orders.' : 'Scan the QR code at your table to request approval. You can still browse the menu.'}</p>}
    {error && <p role="alert">{error}</p>}
    {!approved && !pending && access.state !== 'loading' && (canScan ? <button type="button" disabled={busy || now < retryAt} onClick={() => void issue(['expired','revoked'].includes(access.state))}>{busy ? 'Preparing…' : now < retryAt ? `Try again in ${Math.ceil((retryAt - now) / 1000)}s` : 'Request approval code'}</button> : <button type="button" disabled={now < retryAt} onClick={() => void read()}>Check approval</button>)}
  </aside>
}
