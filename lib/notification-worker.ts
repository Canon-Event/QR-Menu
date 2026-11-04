import webpush from 'web-push'
import { supabaseAdmin } from '@/lib/supabase'
import { pushConfiguration, validPushSubscription } from '@/lib/notification-server'
type Delivery = { id: string; lease: string; subscription_id: string; endpoint: string; p256dh: string; auth: string; inbox_id: string; restaurant_id: string }
export async function runNotificationWorker() {
  const admin = supabaseAdmin()
  const tick = await admin.rpc('notification_tick')
  if (tick.error) throw new Error(`notification_tick:${tick.error.code || 'failed'}`)
  let sent = 0, failed = 0
  if (pushConfiguration().pushConfigured) {
    const started = Date.now()
    // Drain bounded batches instead of limiting a busy restaurant to twenty
    // device deliveries per scheduler tick. Leave time for the last batch.
    for (let batch = 0; batch < 10 && Date.now() - started < 15_000; batch++) {
      const claimed = await admin.rpc('notification_push_claim')
      if (claimed.error) throw new Error(`notification_claim:${claimed.error.code || 'failed'}`)
      const jobs = (claimed.data || []) as Delivery[]
      if (!jobs.length) break
      // Four concurrent sends, each with a short deadline. A crashed worker's
      // leases expire; retries use the same notification ID and push topic.
      for (let start = 0; start < jobs.length; start += 4) {
        const results = await Promise.allSettled(jobs.slice(start, start + 4).map(async job => {
          let status = 0
          const subscription = { endpoint: job.endpoint, keys: { p256dh: job.p256dh, auth: job.auth } }
          try {
            if (!validPushSubscription(subscription)) status = 410
            else {
              const result = await webpush.sendNotification(subscription, JSON.stringify({ id: job.inbox_id, subscription: job.subscription_id }), {
                TTL: 300, urgency: 'normal', topic: job.inbox_id.replaceAll('-', ''), timeout: 5000,
                vapidDetails: { subject: process.env.WEB_PUSH_SUBJECT!, publicKey: process.env.WEB_PUSH_PUBLIC_KEY!, privateKey: process.env.WEB_PUSH_PRIVATE_KEY! },
              })
              status = result.statusCode
            }
          } catch (error) { status = Number((error as { statusCode?: number }).statusCode) || 0 }
          const completed = await admin.rpc('notification_push_finish', { p_id: job.id, p_lease: job.lease, p_status: status })
          if (completed.error) throw new Error(`notification_finish:${completed.error.code || 'failed'}`)
          if (status >= 200 && status < 300) sent++; else failed++
        }))
        for (const result of results) if (result.status === 'rejected') console.error(JSON.stringify({ component: 'notifications', event: 'lease_completion_failed' }))
      }
    }
  }
  const result = { ...tick.data, pushConfigured: pushConfiguration().pushConfigured, sent, failed }
  console.info(JSON.stringify({ component: 'notifications', event: 'worker_tick', ...result }))
  return result
}
