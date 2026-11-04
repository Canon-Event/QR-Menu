import { supabaseAdmin } from '@/lib/supabase'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { readJsonBody } from '@/lib/request-security'
import { UUID } from '@/lib/pos'
import { accessCookieName, accessToken, scanSlug, scanToken, tableIpHash, tableResponse, tokenHash } from '@/lib/table-access-server'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug') || ''
  if (!scanSlug.test(slug) || slug.length < 3 || slug.length > 50) return tableResponse({ error: 'Invalid restaurant.', http_status: 400 })
  try {
    const { data, error } = await supabaseAdmin().rpc('table_access_guest', { p_slug: slug, p_action: 'status', p_scan: null, p_hash: tokenHash(accessToken(request, slug)), p_new_hash: null, p_ip: tableIpHash(request) })
    return tableResponse(data, error)
  } catch { return tableResponse(null, {}) }
}
export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const body = await readJsonBody(request)
  if (!body || typeof body.slug !== 'string' || body.slug.length < 3 || body.slug.length > 50 || !scanSlug.test(body.slug) || typeof body.table !== 'string' || !UUID.test(body.table) || typeof body.nonce !== 'string' || !UUID.test(body.nonce)) return tableResponse({ error: 'Scan the QR code at your table.', http_status: 400 })
  try {
    const token = scanToken(body.slug, body.table, body.nonce)
    const { data, error } = await supabaseAdmin().rpc('table_access_guest', { p_slug: body.slug, p_action: 'issue', p_scan: body.table, p_hash: tokenHash(accessToken(request, body.slug)), p_new_hash: tokenHash(token), p_ip: tableIpHash(request) })
    const response = tableResponse(data, error)
    if (response.ok && ['pending','approved'].includes(data?.state) && !data?.reuse_cookie) response.cookies.set(accessCookieName(body.slug), token, { httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'lax', path: '/api/public', maxAge: 8 * 3600 })
    return response
  } catch { return tableResponse(null, {}) }
}
