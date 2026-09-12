const { test } = require('node:test')
const assert = require('node:assert/strict')
const ts = require('typescript')
const fs = require('node:fs')
const source = ts.transpileModule(fs.readFileSync('lib/request-security.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const loaded = { exports: {} }
new Function('exports', 'module', source)(loaded.exports, loaded)
const { readJsonBody, readFormBody, createRateLimiter } = loaded.exports
const request = body => new Request('https://example.com', { method: 'POST', body })
test('JSON accepts objects and rejects malformed and non-object input', async () => {
  assert.deepEqual(await readJsonBody(request('{"name":"test"}')), { name: 'test' })
  for (const body of ['null', '[]', '1', '"text"', '{']) assert.equal(await readJsonBody(request(body)), null)
})
test('JSON limits actual bytes without trusting Content-Length', async () => {
  assert.equal(await readJsonBody(request(JSON.stringify({ text: 'x'.repeat(32000) }))), null)
  assert.equal(await readJsonBody(request(JSON.stringify({ text: '\u20b9'.repeat(12000) }))), null)
})
test('oversized streams are cancelled before the remaining body is read', async () => {
  let cancelled = false
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(32001)) }, cancel() { cancelled = true } })
  assert.equal(await readJsonBody(new Request('https://example.com', { method: 'POST', body: stream, duplex: 'half' })), null)
  assert.equal(cancelled, true)
})
test('multipart uploads are parsed and bounded', async () => {
  const form = new FormData(); form.set('slot', 'imageUrl'); form.set('image', new Blob(['image']), 'test.png')
  const parsed = await readFormBody(request(form))
  assert.equal(parsed.get('slot'), 'imageUrl')
  assert.equal(await readFormBody(request(form), 10), null)
})
test('rate limits expire and fail closed at capacity', () => {
  const limited = createRateLimiter(2, 100, 2)
  assert.equal(limited('a', 0), false); assert.equal(limited('a', 1), false)
  assert.equal(limited('a', 2), true); assert.equal(limited('b', 3), false)
  assert.equal(limited('c', 4), true); assert.equal(limited('c', 100), false)
})
