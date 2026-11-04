// Read-only authentication probe. Credentials arrive on hidden stdin or through
// environment variables; neither credentials nor provider records are printed.
const readline = require('node:readline')
async function probe(credentials) {
  const { keyId, keySecret } = credentials
  if (!/^rzp_(live|test)_[A-Za-z0-9]+$/.test(keyId || '') || typeof keySecret !== 'string' || keySecret.length < 16) throw new Error('Invalid credentials format.')
  const result = { checkedAt: new Date().toISOString(), mode: keyId.startsWith('rzp_live_') ? 'live' : 'test', operation: 'GET /v1/orders?count=1', authenticated: false }
  try {
    const response = await fetch('https://api.razorpay.com/v1/orders?count=1', { headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}` }, signal: AbortSignal.timeout(15000), redirect: 'error' })
    result.httpStatus = response.status; result.authenticated = response.ok
    await response.body?.cancel() // Do not read or expose merchant/customer records.
    result.result = response.ok ? 'Authentication accepted; checkout and webhook delivery still require validation.' : 'Authentication was not accepted.'
  } catch { result.result = 'Network check failed; authentication is unverified.' }
  console.log(JSON.stringify(result))
}
if (process.env.PAYMENT_CHECK_KEY_ID && process.env.PAYMENT_CHECK_KEY_SECRET) {
  probe({ keyId: process.env.PAYMENT_CHECK_KEY_ID, keySecret: process.env.PAYMENT_CHECK_KEY_SECRET }).catch(() => { console.error('Payment check failed.'); process.exitCode=1 })
} else {
  if (process.stdin.isTTY) { process.stdin.setRawMode(true); readline.emitKeypressEvents(process.stdin) }
  process.stdout.write('Ready for credential JSON on stdin (input is hidden).\n')
  let buffer=''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', async chunk => {
    if (chunk.includes('\u0003')) process.exit(1)
    buffer += chunk
    if (!/[\r\n]/.test(buffer)) return
    process.stdin.removeAllListeners('data'); process.stdin.pause()
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
    try { const credentials=JSON.parse(buffer.trim()); buffer=''; await probe(credentials) }
    catch { console.error('Payment check failed; no credential details were logged.'); process.exitCode=1 }
  })
}
