const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function loadRoute(file, dependencies) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} }
  const requireDependency = name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    if (name.startsWith('@/')) throw new Error(`Unexpected dependency: ${name}`)
    return require(name)
  }
  Function('exports', 'module', 'require', 'process', source)(module.exports, module, requireDependency, { env: { SUPABASE_SERVICE_ROLE_KEY: 'test-key' } })
  return module.exports
}

function database(resultFor) {
  const calls = []
  return {
    calls,
    from(table) {
      let operation = 'select', payload
      const filters = []
      const execute = () => {
        const call = { table, operation, payload, filters }
        calls.push(call)
        return resultFor(call)
      }
      const query = {
        select() { return query },
        eq(key, value) { filters.push([key, value]); return query },
        in(key, value) { filters.push([key, value]); return query },
        insert(value) { operation = 'insert'; payload = value; return query },
        update(value) { operation = 'update'; payload = value; return query },
        async maybeSingle() { return execute() },
        async single() { return execute() },
        then(resolve, reject) { return Promise.resolve().then(execute).then(resolve, reject) },
      }
      return query
    },
  }
}

const restaurantId = '11111111-1111-4111-8111-111111111111'
const dishId = '22222222-2222-4222-8222-222222222222'
const orderId = '33333333-3333-4333-8333-333333333333'
const token = '44444444-4444-4444-8444-444444444444'
const orderBody = { slug: 'green-bistro', idempotencyKey: token, customerName: 'Guest', items: [{ dishId, quantity: 2 }] }
const jsonRequest = (path, body, method = 'POST') => new Request(`https://example.com${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const requestSecurity = { readJsonBody: request => request.json(), createRateLimiter: () => () => false, clientIp: () => 'test' }

function publicOrderRoute(menuMode, options = {}) {
  const db = database(({ table, operation }) => {
    if (table === 'restaurants') return { data: options.lookupError ? null : { id: restaurantId, currency: 'INR', menu_mode: menuMode }, error: options.lookupError ?? null }
    if (table === 'orders' && operation === 'select') return { data: options.existing ?? null }
    if (table === 'dishes') return { data: [{ id: dishId, name: 'Salad', price: 240 }] }
    if (table === 'orders' && operation === 'insert') return { data: { id: orderId, public_token: token, order_number: 7 }, error: null }
    return { error: null }
  })
  const route = loadRoute('app/api/public/orders/route.ts', {
    '@/lib/request-security': requestSecurity,
    '@/lib/menu-api': { rejectUnsafeRequest: () => null },
    '@/lib/supabase': { supabaseAdmin: () => db },
  })
  return { ...route, db }
}

test('view-only mode rejects phone checkout before reading dishes or creating orders', async () => {
  const { POST, db } = publicOrderRoute('view_only')
  const response = await POST(jsonRequest('/api/public/orders', orderBody))
  assert.equal(response.status, 403)
  assert.match((await response.json()).error, /verbally/)
  assert.ok(db.calls.every(call => call.operation === 'select' && call.table !== 'dishes'))
})

test('missing or invalid mode cannot enable mobile ordering', async () => {
  for (const mode of [undefined, null, 'invalid']) {
    const { POST, db } = publicOrderRoute(mode)
    assert.equal((await POST(jsonRequest('/api/public/orders', orderBody))).status, 403)
    assert.ok(db.calls.every(call => call.operation === 'select'))
  }
})

test('database lookup errors do not accept an order', async () => {
  const { POST, db } = publicOrderRoute('ordering', { lookupError: { code: '42703' } })
  assert.equal((await POST(jsonRequest('/api/public/orders', orderBody))).status, 503)
  assert.equal(db.calls.length, 1)
})

test('ordering mode submits quantities using the restaurant dish prices', async () => {
  const { POST, db } = publicOrderRoute('ordering')
  const response = await POST(jsonRequest('/api/public/orders', { ...orderBody, total: 1 }))
  assert.equal(response.status, 201)
  assert.equal((await response.json()).public_token, token)
  const order = db.calls.find(call => call.table === 'orders' && call.operation === 'insert')
  assert.equal(order.payload.total, 480)
  const items = db.calls.find(call => call.table === 'order_items' && call.operation === 'insert')
  assert.equal(items.payload[0].quantity, 2)
  assert.equal(items.payload[0].line_total, 480)
})

test('an already placed order remains accessible on retry after switching to view only', async () => {
  const existing = { public_token: token, order_number: 7 }
  const { POST, db } = publicOrderRoute('view_only', { existing })
  const response = await POST(jsonRequest('/api/public/orders', orderBody))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), existing)
  assert.ok(db.calls.every(call => call.operation === 'select'))
})

function settingsRoute(authError = null, initialSettings = {}) {
  const db = database(({ operation, payload }) => ({ data: operation === 'select' ? { template_settings: initialSettings } : { id: restaurantId, ...payload }, error: null }))
  const route = loadRoute('app/api/settings/route.ts', {
    '@/lib/request-security': requestSecurity,
    '@/lib/menu-api': {
      rejectUnsafeRequest: () => null,
      getOwnedRestaurant: async () => authError ? { error: authError } : { supabase: db, restaurantId },
      menuDatabaseError: () => Response.json({ error: 'Database error' }, { status: 503 }),
    },
    '@/lib/menu-validation': { cleanText: value => typeof value === 'string' ? value.trim() : '' },
    '@/lib/menu-fonts': { MENU_FONT_KEYS: [] },
    '@/lib/menu-layout': loadRoute('lib/menu-layout.ts', {}),
  })
  return { ...route, db }
}

test('owner can save either mode and changes are scoped to the owned restaurant', async () => {
  for (const menuMode of ['view_only', 'ordering']) {
    const { PATCH, db } = settingsRoute()
    const response = await PATCH(jsonRequest('/api/settings', { section: 'menu_mode', menuMode, restaurantId: 'someone-else' }, 'PATCH'))
    assert.equal(response.status, 200)
    assert.equal((await response.json()).restaurant.menu_mode, menuMode)
    assert.deepEqual(db.calls[0].filters, [['id', restaurantId]])
  }
})

test('invalid modes and unauthenticated requests cannot change restaurant settings', async () => {
  for (const menuMode of [undefined, null, true, 'ORDERING', 'invalid']) {
    const { PATCH, db } = settingsRoute()
    assert.equal((await PATCH(jsonRequest('/api/settings', { section: 'menu_mode', menuMode }, 'PATCH'))).status, 400)
    assert.equal(db.calls.length, 0)
  }
  const { PATCH, db } = settingsRoute(Response.json({ error: 'Sign in' }, { status: 401 }))
  assert.equal((await PATCH(jsonRequest('/api/settings', { section: 'menu_mode', menuMode: 'ordering' }, 'PATCH'))).status, 401)
  assert.equal(db.calls.length, 0)
})

test('template saves persist category artwork and preserve it when an older editor omits the field', async () => {
  const categoryPresentation = { [dishId]: { kind: 'pizza', imageUrl: 'https://example.com/pizza.jpg' } }
  const body = { section: 'template_customization', template: 'B', font: 'Georgia', primaryColor: '#294236', restaurantNameSize: 40, subtitleSize: 12, menuTitleSize: 32, categorySize: 24, dishNameSize: 14, descriptionSize: 12, priceSize: 14, addressSize: 10 }
  for (const includeField of [true, false]) {
    const { PATCH } = settingsRoute(null, { B: { categoryPresentation }, C: { font: 'serif' } })
    const response = await PATCH(jsonRequest('/api/settings', { ...body, ...(includeField ? { categoryPresentation } : {}) }, 'PATCH'))
    assert.equal(response.status, 200)
    const result = (await response.json()).restaurant.template_settings
    assert.deepEqual(result.B.categoryPresentation, categoryPresentation)
    assert.deepEqual(result.C, { font: 'serif' })
  }
  const { PATCH, db } = settingsRoute()
  const response = await PATCH(jsonRequest('/api/settings', { ...body, categoryPresentation: { [dishId]: { kind: 'invalid' } } }, 'PATCH'))
  assert.equal(response.status, 400)
  assert.equal(db.calls.length, 0)
})
