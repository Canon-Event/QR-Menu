'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

export default function TableAccessPanel({ restaurantId }: { restaurantId: string }) {
  const url = `/api/table-access?restaurant=${restaurantId}`
  const [data, setData] = useState<any>(null), [code, setCode] = useState(''), [match, setMatch] = useState<any>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [retryAt, setRetryAt] = useState(0)
  const version = useRef(0), saving = useRef(false)
  const load = useCallback(async () => {
    const current = ++version.current
    try { const r = await fetch(url, { cache: 'no-store' }), value = await r.json(); if (current !== version.current) return; if (!r.ok) { if (r.status === 403) setData(null); throw new Error(value.error) }; setData(value) }
    catch (e) { if (current === version.current) setError(e instanceof Error ? e.message : 'Could not refresh table access.') }
  }, [url])
  useEffect(() => { void load(); const timer = setInterval(() => { if (!document.hidden) void load() }, 15000); return () => { clearInterval(timer); ++version.current } }, [load])
  async function act(action: string, payload: any) {
    if (saving.current || Date.now() < retryAt) return null
    saving.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data: payload }) }), value = await r.json()
      if (!r.ok) { if (r.status === 429) { setRetryAt(Date.now() + Number(r.headers.get('Retry-After') || 60) * 1000); setMatch(null) }; throw new Error(value.error || 'Could not update approval.') }
      await load(); return value
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update approval.'); return null } finally { saving.current = false; setBusy(false) }
  }
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  return <section className="pos-panel table-access-panel"><p className="pos-eyebrow">In-person phone approval</p><h2>Verify a guest at their table</h2><p>The guest scans a table QR and shows you four digits. Approve only while you can see that code on their phone at the stated table.</p>{error && <p className="pos-alert" role="alert">{error}</p>}{notice && <p className="pos-notice" role="status">{notice}</p>}{data && <>
    {data.can_configure && <label className="pos-check"><input type="checkbox" checked={data.enabled} disabled={busy} onChange={async e => { if (await act('settings', { enabled: e.target.checked })) { setMatch(null); setNotice('Waiter verification setting saved.') } }} />Require waiter approval for phone orders</label>}
    {!data.enabled ? <p>Verification is switched off. The owner can enable it after adding tables and enabling phone ordering.</p> : <form onSubmit={async e => { e.preventDefault(); setMatch(null); const value = await act('find', { code }); if (value) setMatch({ ...value, code }) }}>
      <label>Guest four-digit code<input required inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" minLength={4} maxLength={4} value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setMatch(null) }} /></label>
      <button type="submit" disabled={busy || code.length !== 4 || now < retryAt}>{now < retryAt ? `Try again in ${Math.ceil((retryAt - now) / 1000)}s` : 'Find phone code'}</button>
    </form>}
    {match && <div className="pos-preview"><h3>{match.table_name}</h3><p>{match.state === 'approved' ? 'This phone is already approved.' : 'Confirm the guest is at this table and the code matches their screen.'}</p>{!match.visit_id ? <p>Seat the guests using Tables, then look up the code again.</p> : <button disabled={busy || now < retryAt || Date.parse(match.code_expires_at) <= now} onClick={async () => { if (await act('approve', { session_id: match.session_id, visit_id: match.visit_id, code: match.code })) { setMatch(null); setCode(''); setNotice(`Phone approved for ${match.table_name}.`) } }}>Approve this phone</button>}</div>}
    <details><summary>Table QR codes and approved phones</summary><p className="pos-small">Print one QR for each table. Open and close visits under Tables. Closing a visit removes its phones’ ordering access.</p><div className="pos-table-grid">{data.tables.map((t: any) => <article className="pos-preview" key={t.id}><h3>{t.name}</h3><TableScanQr slug={data.slug} scanToken={t.scan_token} /><p>{t.visit_id ? 'Guests seated' : 'No open visit'} · {t.approved.length} approved phones</p>{t.approved.map((s: any, i: number) => <p key={s.id}>Phone {i + 1} · {new Date(s.approved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} <button type="button" disabled={busy} onClick={async () => { if (await act('revoke', { session_id: s.id })) setNotice('Phone access revoked.') }}>Revoke phone {i + 1} at {t.name}</button></p>)}</article>)}</div></details>
  </>}</section>
}
function TableScanQr({ slug, scanToken }: { slug: string; scanToken: string }) {
  const [src, setSrc] = useState(''), [url, setUrl] = useState('')
  useEffect(() => { let active = true; const value = `${window.location.origin}/menu/${slug}?table=${scanToken}`; setUrl(value); QRCode.toDataURL(value, { width: 240, margin: 2 }).then(s => { if (active) setSrc(s) }).catch(() => {}); return () => { active = false } }, [slug, scanToken])
  return <>{src && <img width={160} height={160} src={src} alt="Scan this table to request waiter approval" />}<p><a href={url} target="_blank" rel="noreferrer">Open table menu</a> {src && <a href={src} download={`${slug}-table-${scanToken.slice(0, 6)}.png`}>Save QR</a>}</p></>
}
