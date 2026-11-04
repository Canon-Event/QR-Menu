// Run once from a deployment scheduler every minute. No in-process timer.
// Node 20+: node --env-file=.env.local scripts/notification-worker.cjs
const origin = process.env.NOTIFICATION_WORKER_ORIGIN || process.env.NEXT_PUBLIC_BASE_URL
const secret = process.env.CRON_SECRET
async function main() {
  if (!origin || !secret || secret.length < 32) throw new Error('Set NOTIFICATION_WORKER_ORIGIN and a 32+ character CRON_SECRET.')
  const url = new URL('/api/notifications/jobs', origin)
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('The notification worker requires HTTPS outside localhost.')
  const response = await fetch(url, { method:'POST', headers:{Authorization:`Bearer ${secret}`}, signal:AbortSignal.timeout(55000) })
  if (!response.ok) throw new Error(`Notification worker returned HTTP ${response.status}.`)
  console.log(JSON.stringify(await response.json()))
}
main().catch(error => { console.error(error.message); process.exitCode=1 })
