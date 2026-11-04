import 'server-only'
import { createHash, createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { NextResponse } from 'next/server'

export const scanSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const tokenPattern = /^[a-f0-9]{64}$/
export const accessCookieName = (slug: string) => `wiit_table_${slug}`
export function accessToken(request: Request, slug: string) {
  const value = request.headers.get('cookie')?.split(';').map(p => p.trim()).find(p => p.startsWith(accessCookieName(slug) + '='))?.slice(accessCookieName(slug).length + 1)
  return value && tokenPattern.test(value) ? value : null
}
export function tokenHash(value: string | null) {
  return value ? createHash('sha256').update(value).digest('hex') : null
}
function secret() {
  const value = process.env.TABLE_ACCESS_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!value || value.length < 24) throw new Error('Table verification is not configured.')
  return value
}
export function scanToken(slug: string, table: string, nonce: string) {
  return createHmac('sha256', secret()).update(`table-scan:${slug}:${table}:${nonce}`).digest('hex')
}
export function tableIpHash(request: Request) {
  // Trust only the deployment proxy, never an arbitrary client-supplied XFF.
  // A custom proxy must strip/rewrite the configured header before forwarding.
  const header = process.env.VERCEL === '1' ? 'x-vercel-forwarded-for' : process.env.TABLE_ACCESS_TRUSTED_IP_HEADER
  const candidate = header ? request.headers.get(header)?.split(',')[0]?.trim() || '' : ''
  const ip = isIP(candidate) ? candidate : 'unknown'
  return createHmac('sha256', secret()).update(`table-ip:${ip}`).digest('hex')
}
export function tableResponse(data: any, error?: { code?: string } | null) {
  const status = error ? (error.code === '42501' ? 403 : 503) : Number(data?.http_status) || 200
  const headers: Record<string,string> = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' }
  if (data?.retry_after > 0) headers['Retry-After'] = String(data.retry_after)
  const { reuse_cookie: _reuse, http_status: _status, ...body } = data || {}
  return NextResponse.json(error ? { error: status === 403 ? 'You do not have permission for this table.' : 'Table verification is unavailable. Ask the owner to check its setup.' } : body, { status, headers })
}
