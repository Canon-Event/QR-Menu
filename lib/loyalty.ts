// Shared, non-secret rules used by the dashboard and customer card.
export type CardStyle = 'minimal' | 'paper' | 'bold'
export type StampIcon = 'coffee' | 'star' | 'utensils'
export type CardFont = 'modern' | 'classic' | 'friendly'

export interface LoyaltyProgram {
  restaurant_id: string
  enabled: boolean
  launched_at?: string | null
  title: string
  reward_name: string
  stamp_target: number
  minimum_spend: number
  inactivity_days: number
  reward_valid_days: number
  card_style: CardStyle
  accent_color: string
  background_color: string
  stamp_icon: StampIcon
  card_font: CardFont
}
export interface LoyaltyMember {
  id: string
  restaurant_id: string
  card_code: string
  display_name: string
  phone_last4: string
  progress_expires_at: string | null
  created_at: string
}
export interface LoyaltyStamp {
  id: string
  member_id: string
  status: 'available' | 'consumed' | 'expired' | 'reversed'
  bill_reference: string
  paid_amount: number
  created_at: string
  reward_id: string | null
}
export interface LoyaltyReward {
  id: string
  member_id: string
  reward_name: string
  expires_at: string
  redeemed_at: string | null
  revoked_at: string | null
  created_at: string
}
export interface LoyaltyWallet {
  member: LoyaltyMember
  stamps: LoyaltyStamp[]
  rewards: LoyaltyReward[]
}

export function defaultLoyaltyProgram(restaurantId: string, accent?: string): LoyaltyProgram {
  return {
    restaurant_id: restaurantId, enabled: false, title: 'Good food. Great rewards.',
    reward_name: 'A complimentary coffee', stamp_target: 5, minimum_spend: 0,
    inactivity_days: 180, reward_valid_days: 30, card_style: 'paper',
    accent_color: /^#[0-9a-f]{6}$/i.test(accent || '') ? accent! : '#465FFF',
    background_color: '#F7F3E8', stamp_icon: 'coffee', card_font: 'classic',
  }
}

export function parseLoyaltyProgram(body: Record<string, unknown>, restaurantId: string): LoyaltyProgram {
  const text = (key: string, max: number) => {
    if (typeof body[key] !== 'string') throw new Error('Complete the card title and reward name.')
    const value = (body[key] as string).trim().replace(/\s+/g, ' ')
    if (!value || value.length > max) throw new Error(`${key === 'title' ? 'Card title' : 'Reward name'} must be between 1 and ${max} characters.`)
    return value
  }
  const whole = (key: string, min: number, max: number) => {
    const value = body[key]
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error('Choose valid stamp and expiry limits.')
    return value
  }
  if (typeof body.enabled !== 'boolean') throw new Error('Choose whether the program is active.')
  if (typeof body.minimum_spend !== 'number' || !Number.isFinite(body.minimum_spend) || body.minimum_spend < 0 || body.minimum_spend > 1000000 || Math.abs(body.minimum_spend * 100 - Math.round(body.minimum_spend * 100)) > 0.00001) throw new Error('Minimum spend must be a positive amount or zero, with up to two decimal places.')
  if (!['minimal', 'paper', 'bold'].includes(String(body.card_style)) || !['coffee', 'star', 'utensils'].includes(String(body.stamp_icon)) || !['modern', 'classic', 'friendly'].includes(String(body.card_font))) throw new Error('Choose one of the available card styles, icons and fonts.')
  if (![body.accent_color, body.background_color].every(color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) throw new Error('Choose valid card colours.')
  return {
    restaurant_id: restaurantId, enabled: body.enabled, title: text('title', 60), reward_name: text('reward_name', 100),
    stamp_target: whole('stamp_target', 3, 12), minimum_spend: body.minimum_spend,
    inactivity_days: whole('inactivity_days', 30, 365), reward_valid_days: whole('reward_valid_days', 7, 180),
    card_style: body.card_style as CardStyle, stamp_icon: body.stamp_icon as StampIcon,
    card_font: body.card_font as CardFont, accent_color: body.accent_color as string, background_color: body.background_color as string,
  }
}

export function normalizeLoyaltyPhone(value: unknown) {
  if (typeof value !== 'string' || !/^[+\d\s()-]+$/.test(value)) return null
  const compact = value.replace(/[\s()-]/g, '')
  // Default Indian mobile numbers to +91; international numbers must include +.
  const phone = /^[6-9]\d{9}$/.test(compact) ? `+91${compact}` : compact
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null
}

export function normalizeCardCode(value: string) {
  let code = value.trim()
  try { code = new URL(code).searchParams.get('member') || code } catch { /* Plain card code. */ }
  code = code.replace(/^WIIT:/i, '').replace(/[\s-]/g, '').toUpperCase()
  return /^[A-F0-9]{12}$/.test(code) ? code : null
}

export function walletProgress(wallet: LoyaltyWallet, now = Date.now()) {
  if (wallet.member.progress_expires_at && Date.parse(wallet.member.progress_expires_at) <= now) return 0
  return wallet.stamps.filter(stamp => stamp.status === 'available').length
}
export function rewardStatus(reward: LoyaltyReward, now = Date.now()) {
  if (reward.revoked_at) return 'revoked'
  if (reward.redeemed_at) return 'redeemed'
  return Date.parse(reward.expires_at) <= now ? 'expired' : 'ready'
}
export function loyaltyDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(value))
}
export function readableInk(hex: string) {
  const channels = hex.replace('#', '').match(/.{2}/g)!.map(part => {
    const s = parseInt(part, 16) / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  return (1.05 / (luminance + 0.05)) >= ((luminance + 0.05) / 0.05) ? '#FFFFFF' : '#000000'
}
