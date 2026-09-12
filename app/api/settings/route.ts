import { readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { getOwnedRestaurant, menuDatabaseError, rejectUnsafeRequest } from '@/lib/menu-api'
import { cleanText } from '@/lib/menu-validation'
import { MENU_FONT_KEYS } from '@/lib/menu-fonts'

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const colorPattern = /^#[0-9a-f]{6}$/i

export async function PATCH(request: Request) {
  const unsafe = rejectUnsafeRequest(request); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const body = (await readJsonBody(request) ?? {})
  const section = body?.section

  if (section === 'account') {
    const displayName = cleanText(body?.displayName, 100)
    if (displayName.length < 2 || displayName.length > 100) return NextResponse.json({ error: 'Display name must be 2–100 characters.' }, { status: 400 })
    const { error } = await auth.supabase.auth.updateUser({ data: { full_name: displayName } })
    if (error) return NextResponse.json({ error: 'Could not update your account profile.' }, { status: 503 })
    return NextResponse.json({ displayName })
  }

  const updates: Record<string, unknown> = {}
  if (section === 'restaurant') {
    const name = cleanText(body?.name, 100)
    const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
    const description = cleanText(body?.description, 300)
    const address = cleanText(body?.address, 250)
    const phone = cleanText(body?.phone, 30)
    const logoUrl = typeof body?.logoUrl === 'string' ? body.logoUrl.trim() : ''
    const currency = ['INR', 'USD', 'EUR', 'GBP', 'AED'].includes(body?.currency) ? body.currency : null
    if (name.length < 2 || name.length > 100) return NextResponse.json({ error: 'Restaurant name must be 2–100 characters.' }, { status: 400 })
    if (!slugPattern.test(slug) || slug.length < 3 || slug.length > 50) return NextResponse.json({ error: 'Menu address must use 3–50 lowercase letters, numbers, and hyphens.' }, { status: 400 })
    if (description.length > 300 || address.length > 250 || phone.length > 30) return NextResponse.json({ error: 'One or more fields are too long.' }, { status: 400 })
    if (logoUrl && (!/^https:\/\//i.test(logoUrl) || logoUrl.length > 2048)) return NextResponse.json({ error: 'Logo must be a valid HTTPS URL.' }, { status: 400 })
    if (!currency) return NextResponse.json({ error: 'Select a supported currency.' }, { status: 400 })
    Object.assign(updates, { name, slug, description: description || null, address: address || null, phone: phone || null, logo_url: logoUrl || null, currency })
  } else if (section === 'template') {
    if (!['A', 'B', 'C'].includes(body?.template)) return NextResponse.json({ error: 'Select a valid template.' }, { status: 400 })
    updates.template = body.template
  } else if (section === 'template_customization') {
    const template = ['A', 'B', 'C'].includes(body?.template) ? body.template : null
    const rawFont = typeof body?.font === 'string' ? body.font.trim() : ''
    const font = MENU_FONT_KEYS.includes(rawFont as typeof MENU_FONT_KEYS[number]) || /^[A-Za-z0-9 .'-]{1,100}$/.test(rawFont) ? rawFont : null
    const primaryColor = typeof body?.primaryColor === 'string' && colorPattern.test(body.primaryColor) ? body.primaryColor.toLowerCase() : null
    const sizes = {
      restaurantNameSize: Number(body?.restaurantNameSize),
      subtitleSize: Number(body?.subtitleSize),
      menuTitleSize: Number(body?.menuTitleSize),
      categorySize: Number(body?.categorySize),
      dishNameSize: Number(body?.dishNameSize),
      descriptionSize: Number(body?.descriptionSize),
      priceSize: Number(body?.priceSize),
      addressSize: Number(body?.addressSize),
    }
    const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl.trim() : ''
    const menuPageLayout = ['four', 'botanical', 'both'].includes(body?.menuPageLayout) ? body.menuPageLayout : 'both'
    const copy = {
      coverEyebrow: cleanText(body?.coverEyebrow, 100),
      coverSideNote: cleanText(body?.coverSideNote, 100),
      coverTagline: cleanText(body?.coverTagline, 100),
      menuLabel: cleanText(body?.menuLabel, 40),
      sectionKicker: cleanText(body?.sectionKicker, 100),
      categoryTagline: cleanText(body?.categoryTagline, 100),
      thankYouTitle: cleanText(body?.thankYouTitle, 80),
      thankYouSubtitle: cleanText(body?.thankYouSubtitle, 100),
      thankYouMessage: cleanText(body?.thankYouMessage, 240),
      openingHours: cleanText(body?.openingHours, 160),
      coverMenuNote: cleanText(body?.coverMenuNote, 140),
      coverFooter: cleanText(body?.coverFooter, 140),
      socialHandle: cleanText(body?.socialHandle, 80),
      reserveLabel: cleanText(body?.reserveLabel, 80),
      reserveMessage: cleanText(body?.reserveMessage, 140),
      ingredientNoteTitle: cleanText(body?.ingredientNoteTitle, 100),
      ingredientNote: cleanText(body?.ingredientNote, 300),
      closingFooter: cleanText(body?.closingFooter, 140),
    }
    const artwork = {
      menuImageOne: typeof body?.menuImageOne === 'string' ? body.menuImageOne.trim() : '',
      menuImageTwo: typeof body?.menuImageTwo === 'string' ? body.menuImageTwo.trim() : '',
      menuImageThree: typeof body?.menuImageThree === 'string' ? body.menuImageThree.trim() : '',
      menuImageFour: typeof body?.menuImageFour === 'string' ? body.menuImageFour.trim() : '',
      backImageUrl: typeof body?.backImageUrl === 'string' ? body.backImageUrl.trim() : '',
    }
    if (!template || !font || !primaryColor || Object.values(sizes).some(size => !Number.isInteger(size) || size < 8 || size > 96)) return NextResponse.json({ error: 'Choose valid template settings. Text sizes must be whole pixels between 8 and 96.' }, { status: 400 })
    if (imageUrl && (!/^https:\/\//i.test(imageUrl) || imageUrl.length > 2048)) return NextResponse.json({ error: 'Background image must be a valid HTTPS URL.' }, { status: 400 })
    if (Object.values(artwork).some(url => url && (!/^https:\/\//i.test(url) || url.length > 2048))) return NextResponse.json({ error: 'Every custom artwork URL must use HTTPS.' }, { status: 400 })
    const { data: current, error: currentError } = await auth.supabase.from('restaurants').select('template_settings').eq('id', auth.restaurantId).maybeSingle()
    if (currentError) return menuDatabaseError(currentError)
    updates.template_settings = { ...(current?.template_settings || {}), [template]: { font, primaryColor, imageUrl, menuPageLayout, ...sizes, ...copy, ...artwork } }
  } else if (section === 'qr') {
    const margin = Number(body?.margin)
    if (!colorPattern.test(body?.foreground) || !colorPattern.test(body?.background) || !Number.isInteger(margin) || margin < 0 || margin > 8) return NextResponse.json({ error: 'Choose valid QR colors and a margin from 0–8.' }, { status: 400 })
    if (body.foreground.toLowerCase() === body.background.toLowerCase()) return NextResponse.json({ error: 'QR foreground and background must be different.' }, { status: 400 })
    Object.assign(updates, { qr_foreground: body.foreground.toLowerCase(), qr_background: body.background.toLowerCase(), qr_margin: margin })
  } else if (section === 'publishing') {
    if (typeof body?.isActive !== 'boolean') return NextResponse.json({ error: 'Invalid publishing status.' }, { status: 400 })
    updates.is_active = body.isActive
  } else return NextResponse.json({ error: 'Invalid settings section.' }, { status: 400 })

  const { data, error } = await auth.supabase.from('restaurants').update(updates).eq('id', auth.restaurantId).select('*').maybeSingle()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'That menu address is already taken.' }, { status: 409 })
    return menuDatabaseError(error)
  }
  if (!data) return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 })
  return NextResponse.json({ restaurant: data })
}
