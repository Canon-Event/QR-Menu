import { staffAuth } from '@/lib/staff-server'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { readJsonBody } from '@/lib/request-security'
import { UUID } from '@/lib/pos'
import { tableResponse } from '@/lib/table-access-server'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const auth = await staffAuth(request); if ('error' in auth) return auth.error
  const { data, error } = await auth.supabase.rpc('table_access_staff', { p_restaurant_id: auth.restaurantId, p_action: 'state', p_data: {} })
  return tableResponse(data, error)
}
export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await staffAuth(request); if ('error' in auth) return auth.error
  const body = await readJsonBody(request)
  if (!body || !['settings','find','approve','revoke'].includes(body.action) || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) return tableResponse({ error: 'Invalid approval request.', http_status: 400 })
  if (['find','approve'].includes(body.action) && !/^[0-9]{4}$/.test(body.data.code || '')) return tableResponse({ error: 'Enter the four digits shown on the guest phone.', http_status: 400 })
  if (['approve','revoke'].includes(body.action) && (typeof body.data.session_id !== 'string' || !UUID.test(body.data.session_id))) return tableResponse({ error: 'Look up the phone code again.', http_status: 400 })
  if (body.action === 'approve' && (typeof body.data.visit_id !== 'string' || !UUID.test(body.data.visit_id))) return tableResponse({ error: 'Seat the guests before approving their phone.', http_status: 400 })
  const { data, error } = await auth.supabase.rpc('table_access_staff', { p_restaurant_id: auth.restaurantId, p_action: body.action, p_data: body.data })
  return tableResponse(data, error)
}
