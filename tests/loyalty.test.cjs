const test = require('node:test')
const assert = require('node:assert/strict')
const { loadTypeScript } = require('./helpers/load-typescript.cjs')
const { defaultLoyaltyProgram, parseLoyaltyProgram, normalizeLoyaltyPhone, normalizeCardCode, walletProgress, rewardStatus, readableInk } = loadTypeScript('lib/loyalty.ts')

test('program settings validate limits, amounts, text and colours', () => {
  const draft = defaultLoyaltyProgram('restaurant')
  assert.deepEqual(parseLoyaltyProgram(draft, 'restaurant'), draft)
  for (const values of [{ stamp_target: 0 }, { stamp_target: 13 }, { stamp_target: '5' }, { minimum_spend: -1 }, { minimum_spend: 0.001 }, { minimum_spend: NaN }, { inactivity_days: 0 }, { reward_valid_days: 181 }, { accent_color: 'url(https://bad)' }, { title: ' ' }, { card_style: 'custom' }, { enabled: 'true' }]) {
    assert.throws(() => parseLoyaltyProgram({ ...draft, ...values }, 'restaurant'), JSON.stringify(values))
  }
  assert.equal(parseLoyaltyProgram({ ...draft, restaurant_id: 'other' }, 'owned').restaurant_id, 'owned')
})
test('phone normalization accepts Indian mobiles and explicit international numbers', () => {
  assert.equal(normalizeLoyaltyPhone('98765 43210'), '+919876543210')
  assert.equal(normalizeLoyaltyPhone('+44 7700 900123'), '+447700900123')
  assert.equal(normalizeLoyaltyPhone('1234'), null)
  assert.equal(normalizeLoyaltyPhone('919876543210'), null)
  assert.equal(normalizeLoyaltyPhone('+91<script>9876543210'), null)
})
test('card lookup accepts code, scanner output and counter URL, never arbitrary text', () => {
  assert.equal(normalizeCardCode('abcd ef12 3456'), 'ABCDEF123456')
  assert.equal(normalizeCardCode('WIIT:ABCDEF123456'), 'ABCDEF123456')
  assert.equal(normalizeCardCode('https://menu.test/dashboard/loyalty?member=ABCDEF123456'), 'ABCDEF123456')
  assert.equal(normalizeCardCode('ABC'), null)
  assert.equal(normalizeCardCode("' OR 1=1"), null)
})
test('progress expires at the exact boundary; unlocked rewards have their own expiry', () => {
  const now = Date.parse('2026-10-25T00:00:00Z')
  const wallet = { member: { progress_expires_at: '2026-10-25T00:00:00Z' }, stamps: [{ status: 'available' }, { status: 'consumed' }] }
  assert.equal(walletProgress(wallet, now - 1), 1)
  assert.equal(walletProgress(wallet, now), 0)
  const reward = { expires_at: '2026-11-01T00:00:00Z', redeemed_at: null, revoked_at: null }
  assert.equal(rewardStatus(reward, now), 'ready')
  assert.equal(rewardStatus(reward, Date.parse(reward.expires_at)), 'expired')
  assert.equal(rewardStatus({ ...reward, redeemed_at: '2026-10-24' }, now), 'redeemed')
  assert.equal(rewardStatus({ ...reward, revoked_at: '2026-10-24' }, now), 'revoked')
})
test('custom card colours always select at least WCAG AA text contrast', () => {
  const luminance = hex => {
    const rgb = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
  }
  for (const hex of ['#FFFFFF', '#000000', '#465FFF', '#F7F3E8', '#FFFF00', '#FF00FF', '#777777', '#00FF00']) {
    const a = luminance(hex), b = luminance(readableInk(hex))
    assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, hex)
  }
})
