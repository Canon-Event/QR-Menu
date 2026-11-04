const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { createHmac, randomUUID } = require('node:crypto')

function load(file, overrides = {}, env = {}, cache = new Map()) {
  const filename = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : file + '.ts')
  if (cache.has(filename)) return cache.get(filename).exports
  const module = { exports: {} }; cache.set(filename, module)
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  Function('module', 'exports', 'require', 'process', source)(module, module.exports, name => {
    if (name === 'server-only') return {}
    if (name in overrides) return overrides[name]
    if (name.startsWith('@/')) return load(name.slice(2), overrides, env, cache)
    if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name), overrides, env, cache)
    return require(name)
  }, { env })
  return module.exports
}
const pos = load('lib/pos.ts'), payments = load('lib/pos-payments.ts')
const restaurant = randomUUID(), billId = randomUUID(), token = randomUUID(), checkoutId = randomUUID()
const account = { keyId: 'rzp_test_restaurant', keySecret: 'test-secret-value-only', webhookSecret: 'webhook-test-secret-only' }
const request = (url, body, headers = {}) => new Request(`https://menu.test${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

test('money parsing rejects floating-point ambiguity, negatives, exponent notation and excessive values', () => {
  assert.equal(pos.paise('0.01'), 1); assert.equal(pos.paise('118'), 11800); assert.equal(pos.paise('1.20'), 120)
  for (const value of ['1.001', '-1', '1e3', 'Infinity', '', {}, 0.1 + 0.2, '10000000.01']) assert.throws(() => pos.paise(value))
  assert.equal(pos.indiaDate(new Date('2026-03-31T19:00:00Z')), '2026-04-01')
})
test('payment accounts are restaurant-scoped, never fall back to SaaS subscription keys', () => {
  const merchant = load('lib/pos-payments.ts', {}, { POS_RAZORPAY_ACCOUNTS: JSON.stringify({ [restaurant]: account }), RAZORPAY_KEY_ID: account.keyId, RAZORPAY_KEY_SECRET: account.keySecret })
  assert.deepEqual(merchant.merchantFor(restaurant), account)
  assert.equal(merchant.merchantFor(randomUUID()), null)
  assert.equal(load('lib/pos-payments.ts', {}, { POS_RAZORPAY_ACCOUNTS: '{bad' }).merchantFor(restaurant), null)
})
test('signature validation uses the original body, rejects missing, malformed and wrong signatures', () => {
  const body = '{ "amount": 100 }', signature = createHmac('sha256', account.webhookSecret).update(body).digest('hex')
  assert.equal(payments.verifySignature(body, signature, account.webhookSecret), true)
  for (const candidate of [null, '', '0', 'z'.repeat(64), '0'.repeat(64)]) assert.equal(payments.verifySignature(body, candidate, account.webhookSecret), false)
  assert.equal(payments.verifySignature('{"amount":100}', signature, account.webhookSecret), false)
})
test('authorized, foreign-currency, mismatched and uncaptured payments cannot settle a bill', () => {
  const payment = { id: 'pay_test', captured: true, status: 'captured', amount: 100, currency: 'INR', order_id: 'order_test' }
  assert.equal(payments.capturedPayment(payment, 'order_test', 100), true)
  for (const change of [{ status: 'authorized' }, { captured: false }, { amount: 1 }, { currency: 'USD' }, { order_id: 'order_other' }]) assert.equal(payments.capturedPayment({ ...payment, ...change }, 'order_test', 100), false)
})
test('public receipts omit staff identities, replay keys, merchant references and internal credit IDs', () => {
  const { publicBill } = load('lib/pos-server.ts', { '@/lib/supabase': {}, '@/lib/pos-payments': {} })
  const value = publicBill({ id: billId, created_by: 'STAFF_SECRET', request_key: 'REPLAY_SECRET', seller: { legal_name: 'Cafe', address: 'Road', gstin: '', state_code: '29', sac: '996331', restaurant_id: 'TENANT_SECRET' }, customer: { name: 'Guest' }, lines: [], credits: [{ credit_number: 'C/2627/000001', amount_paise: 1, refund_id: 'REFUND_SECRET' }], payments: [{ method: 'razorpay', amount_paise: 1, provider_payment_id: 'GATEWAY_SECRET', account_key_id: 'KEY_SECRET' }] })
  const serialized = JSON.stringify(value)
  for (const secret of ['STAFF_SECRET', 'REPLAY_SECRET', 'TENANT_SECRET', 'REFUND_SECRET', 'GATEWAY_SECRET', 'KEY_SECRET']) assert.equal(serialized.includes(secret), false)
})
test('owner billing routes reject anonymous and cross-origin writes and use the authenticated restaurant', async () => {
  const { rejectUnsafeRequest } = load('lib/menu-api.ts', { '@/lib/supabase-server': {} })
  let calls = 0, captured
  const ownerApi = auth => load('app/api/billing/route.ts', {
    '@/lib/menu-api': { rejectUnsafeRequest, getOwnedRestaurant: async () => auth },
    '@/lib/pos-server': { posError: () => Response.json({ error: 'Unavailable' }, { status: 503 }) },
    '@/lib/pos-payments': { merchantFor: () => null },
  })
  const anonymous = ownerApi({ error: Response.json({ error: 'Sign in' }, { status: 401 }) })
  assert.equal((await anonymous.POST(request('/api/billing', { action: 'issue', data: {} }))).status, 401)
  const api = ownerApi({ restaurantId: restaurant, supabase: { rpc: async (name, args) => { calls++; captured = args; return { data: { ok: true } } } } })
  assert.equal((await api.POST(request('/api/billing', { action: 'cash', data: {} }, { origin: 'https://evil.test' }))).status, 403)
  assert.equal(calls, 0)
  assert.equal((await api.POST(request('/api/billing', { action: 'cash', data: { bill_id: billId, request_key: randomUUID(), amount_paise: 1, restaurant_id: randomUUID() } }))).status, 200)
  assert.equal(captured.p_restaurant_id, restaurant)
  assert.equal((await api.POST(request('/api/billing', { action: 'cash', data: { amount_paise: 0.1 } }))).status, 400)
})
test('checkout creates provider orders from stored invoice amounts and ignores client amount claims', async () => {
  const calls = [], external = []
  const api = load('app/api/public/billing/checkout/route.ts', {
    '@/lib/menu-api': { rejectUnsafeRequest: () => null },
    '@/lib/pos-payments': { ...payments, merchantFor: () => account, provider: async (a, p, body) => { external.push(body); return { id: 'order_created', amount: 11800, currency: 'INR' } } },
    '@/lib/pos-server': { gateway: async (action, data) => { calls.push({ action, data }); return { data: action === 'lookup' ? { restaurant_id: restaurant, seller: { legal_name: 'Cafe' } } : action === 'checkout' ? { id: checkoutId, fresh: true, amount_paise: 11800 } : {} } }, posError: () => Response.json({}, { status: 409 }) },
  })
  const response = await api.POST(request('/api/public/billing/checkout', { token, request_key: randomUUID(), amount: 1, paid: true }))
  assert.equal(response.status, 200); assert.equal(external[0].amount, 11800)
  assert.equal((await response.json()).amount, 11800)
  assert.equal(calls.some(c => c.action === 'capture'), false)
})
test('browser success callbacks are only hints: signature and server-fetched capture are both required', async () => {
  let fetched = 0, applied = 0, captured = false
  const api = load('app/api/public/billing/verify/route.ts', {
    '@/lib/menu-api': { rejectUnsafeRequest: () => null },
    '@/lib/pos-payments': { ...payments, merchantFor: () => account, provider: async () => { fetched++; return { id: 'pay_test', captured, status: captured ? 'captured' : 'authorized', amount: 11800, currency: 'INR', order_id: 'order_test' } } },
    '@/lib/pos-server': { gateway: async action => action === 'lookup' ? { data: { id: billId, restaurant_id: restaurant } } : action === 'checkout_get' ? { data: { bill_id: billId, amount_paise: 11800, provider_order_id: 'order_test', account_key_id: account.keyId } } : (applied++, { data: {} }), posError: () => Response.json({}, { status: 409 }) },
  })
  const body = { token, checkoutId, paymentId: 'pay_test', signature: '0'.repeat(64) }
  assert.equal((await api.POST(request('/api/public/billing/verify', body))).status, 400)
  assert.equal(fetched, 0); assert.equal(applied, 0)
  body.signature = createHmac('sha256', account.keySecret).update('order_test|pay_test').digest('hex')
  assert.equal((await api.POST(request('/api/public/billing/verify', body))).status, 202); assert.equal(applied, 0)
  captured = true
  assert.equal((await api.POST(request('/api/public/billing/verify', body))).status, 200); assert.equal(applied, 1)
})
test('webhooks reject forged or oversized raw payloads before financial mutations', async () => {
  let calls = 0
  const api = load('app/api/payments/razorpay/webhook/[restaurantId]/route.ts', {
    '@/lib/pos-payments': { ...payments, merchantFor: () => account },
    '@/lib/pos-server': { gateway: async () => { calls++; return { data: {} } }, syncRefund: async () => { calls++ } },
  })
  const context = { params: Promise.resolve({ restaurantId: restaurant }) }, body = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_test', order_id: 'order_test', amount: 11800, captured: true, status: 'captured', currency: 'INR' } } } }
  assert.equal((await api.POST(request('/webhook', body, { 'x-razorpay-signature': '0'.repeat(64) }), context)).status, 400)
  assert.equal(calls, 0)
  const signature = createHmac('sha256', account.webhookSecret).update(JSON.stringify(body)).digest('hex')
  assert.equal((await api.POST(request('/webhook', body, { 'x-razorpay-signature': signature }), context)).status, 200)
  assert.equal(calls, 1)
  assert.equal((await api.POST(request('/webhook', { data: 'a'.repeat(65537) }), context)).status, 413)
  assert.equal(calls, 1)
})
