import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { runNotificationWorker } from '@/lib/notification-worker'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET || '', token = request.headers.get('authorization') || ''
  const expected = `Bearer ${secret}`
  if (secret.length < 32 || Buffer.byteLength(token) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  try { return NextResponse.json(await runNotificationWorker(), { headers: { 'Cache-Control': 'no-store' } }) }
  catch { console.error(JSON.stringify({ component: 'notifications', event: 'worker_failed' })); return NextResponse.json({ error: 'Notification worker failed; durable work will be retried.' }, { status: 503 }) }
}
export const GET = POST
