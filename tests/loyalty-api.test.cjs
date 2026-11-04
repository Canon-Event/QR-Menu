const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const { randomUUID } = require('node:crypto')
const { loadTypeScript } = require('./helpers/load-typescript.cjs')
const loyalty = loadTypeScript('lib/loyalty.ts')
const security = loadTypeScript('lib/request-security.ts')
const { rejectUnsafeRequest } = loadTypeScript('lib/menu-api.ts')
const { isUuid } = loadTypeScript('lib/menu-validation.ts')
const restaurantId = randomUUID()
const request = (body, headers = {}) => new Request('https://menu.test/api/loyalty/manage', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

function route(file, dependencies, env = { LOYALTY_PHONE_AUTH_ENABLED: 'true' }) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  Function('exports', 'module', 'require', 'process', code)(module.exports, module, name => {
    if (name in dependencies) return dependencies[name]
    if (name.startsWith('@/')) throw new Error('Unexpected dependency: ' + name)
    return require(name)
  }, { env })
  return module.exports
}
function manage(auth, env) {
  return route('app/api/loyalty/manage/route.ts', {
    '@/lib/menu-api': { rejectUnsafeRequest, getOwnedRestaurant: async () => auth },
    '@/lib/request-security': security,
    '@/lib/menu-validation': { isUuid },
    '@/lib/loyalty': loyalty,
    '@/lib/loyalty-server': { loyaltyError: () => Response.json({ error: 'Blocked' }, { status: 409 }) },
  }, env)
}
test('manual actions require an owner session and reject cross-site requests', async () => {
  const handler = manage({ error: Response.json({ error: 'Sign in' }, { status: 401 }) })
  assert.equal((await handler.POST(request({ action: 'award' }))).status, 401)
  assert.equal((await handler.POST(request({}, { origin: 'https://attacker.test' }))).status, 403)
})
test('award always uses the authenticated restaurant, ignores browser identity overrides', async () => {
  let call
  const handler = manage({ restaurantId, supabase: { rpc: async (name, args) => { call = { name, args }; return { data: {}, error: null } } } })
  const response = await handler.POST(request({ action: 'award', restaurantId: randomUUID(), actorId: randomUUID(), memberId: randomUUID(), billReference: '2026-10-25/101', paidAmount: 250, requestKey: randomUUID() }))
  assert.equal(response.status, 200)
  assert.equal(call.args.p_restaurant_id, restaurantId)
  assert.equal(Object.hasOwn(call.args, 'actorId'), false)
})
test('malformed purchases and fake automatic payment actions never reach the database', async () => {
  let calls = 0
  const handler = manage({ restaurantId, supabase: { rpc: async () => { calls++; return {} } } })
  for (const body of [{ action: 'award', paidAmount: 0 }, { action: 'payment_success', paid: true }, { action: 'redeem', rewardId: 'fake', requestKey: randomUUID() }, { action: 'reverse', stampId: randomUUID(), reason: '' }]) assert.equal((await handler.POST(request(body))).status, 400)
  assert.equal(calls, 0)
})
test('activation cannot pretend SMS setup is ready', async () => {
  const handler = manage({ restaurantId, supabase: {} }, { LOYALTY_PHONE_AUTH_ENABLED: 'false' })
  assert.equal((await handler.POST(request({ action: 'save', program: { ...loyalty.defaultLoyaltyProgram(restaurantId), enabled: true } }))).status, 409)
})
test('phone verification uses Supabase verification; wrong codes do not sign in', async () => {
  const calls = []
  const client = {
    from(table) { const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === 'restaurants' ? { id: restaurantId } : { enabled: true } }) }; return query },
    auth: {
      signInWithOtp: async args => { calls.push(args); return { error: null } },
      verifyOtp: async args => { calls.push(args); return { error: args.token === '123456' ? null : { message: 'Invalid' } } },
    },
  }
  const handler = route('app/api/loyalty/auth/route.ts', {
    '@/lib/menu-api': { rejectUnsafeRequest }, '@/lib/request-security': security,
    '@/lib/loyalty': loyalty, '@/lib/loyalty-server': { createLoyaltyClient: async () => client },
  })
  const base = { phone: '9876543210', slug: 'green-bistro' }
  assert.equal((await handler.POST(request({ ...base, action: 'send' }))).status, 200)
  assert.equal(calls[0].phone, '+919876543210')
  assert.equal((await handler.POST(request({ ...base, action: 'verify', code: '000000' }))).status, 400)
  assert.equal((await handler.POST(request({ ...base, action: 'verify', code: '123456' }))).status, 200)
  assert.equal(calls.at(-1).type, 'sms')
})
test('customer membership cannot be created by supplying an unverified phone in a request', async () => {
  const handler = route('app/api/loyalty/card/route.ts', {
    '@/lib/menu-api': { rejectUnsafeRequest }, '@/lib/request-security': security,
    '@/lib/loyalty-server': { createLoyaltyClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) },
  })
  const response = await handler.POST(request({ name: 'Guest', slug: 'green-bistro', phone: '+919876543210', verified: true, customerId: randomUUID() }))
  assert.equal(response.status, 401)
})
test('owner sign-in returns to a scanned card without allowing external redirects', () => {
  const { dashboardReturnPath } = loadTypeScript('lib/auth-redirect.ts')
  assert.equal(dashboardReturnPath('/dashboard/loyalty?member=ABCDEF123456', 'https://menu.test'), '/dashboard/loyalty?member=ABCDEF123456')
  assert.equal(dashboardReturnPath('/staff', 'https://menu.test'), '/staff')
  assert.equal(dashboardReturnPath('/staff/restaurant?tab=orders', 'https://menu.test'), '/staff/restaurant?tab=orders')
  assert.equal(dashboardReturnPath('//evil.test/staff', 'https://menu.test'), '/dashboard')
  for (const input of ['//evil.test/dashboard', 'https://evil.test/dashboard', '/dashboard-evil', '/\\evil.test/dashboard', '/api/loyalty/manage', null]) assert.equal(dashboardReturnPath(input, 'https://menu.test'), '/dashboard')
})
