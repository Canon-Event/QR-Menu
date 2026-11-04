import { NextResponse } from 'next/server'
import { notificationAuth, notificationError, notificationHeaders, pushConfiguration, validPushSubscription } from '@/lib/notification-server'
import { readJsonBody } from '@/lib/request-security'
import { rejectUnsafeRequest } from '@/lib/menu-api'
import { UUID } from '@/lib/pos'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await notificationAuth(request); if ('error' in auth) return auth.error
  if (!pushConfiguration().pushConfigured) return NextResponse.json({ error: 'Background notifications have not been configured for this deployment.' }, { status: 503 })
  const body = await readJsonBody(request, 8192)
  if (!UUID.test(body?.device || '') || !validPushSubscription(body?.subscription)) return NextResponse.json({ error: 'Invalid push subscription.' }, { status: 400 })
  const { data, error } = await auth.client.rpc('notification_push_register', { p_restaurant_id: auth.restaurantId, p_device: body!.device, p_endpoint: body!.subscription.endpoint, p_p256dh: body!.subscription.keys.p256dh, p_auth: body!.subscription.keys.auth })
  return error ? notificationError(error) : NextResponse.json(data, { headers: notificationHeaders })
}
export async function DELETE(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await notificationAuth(request, false); if ('error' in auth) return auth.error
  const body = await readJsonBody(request, 1024)
  if (!UUID.test(body?.device || '')) return NextResponse.json({ error: 'Invalid device.' }, { status: 400 })
  const { data, error } = await auth.client.rpc('notification_push_remove', { p_device: body!.device })
  return error ? notificationError(error) : NextResponse.json(data, { headers: notificationHeaders })
}
export async function GET(request: Request) {
  const auth = await notificationAuth(request, false); if ('error' in auth) return auth.error
  const q = new URL(request.url).searchParams, id = q.get('id'), subscription = q.get('subscription')
  if (!UUID.test(id || '') || !UUID.test(subscription || '')) return NextResponse.json({ error: 'Invalid notification.' }, { status: 400 })
  const { data, error } = await auth.client.rpc('notification_push_check', { p_id: id, p_subscription: subscription })
  return error ? notificationError(error) : NextResponse.json(data, { headers: notificationHeaders })
}
