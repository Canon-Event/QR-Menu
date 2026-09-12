import { readFormBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { getOwnedRestaurant, rejectUnsafeRequest } from '@/lib/menu-api'

const allowedTypes = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']])
const allowedSlots = new Set(['imageUrl', 'menuImageOne', 'menuImageTwo', 'menuImageThree', 'menuImageFour', 'backImageUrl'])

export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request, true); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const form = await readFormBody(request).catch(() => null)
  const file = form?.get('image')
  const slot = String(form?.get('slot') || '')
  if (!allowedSlots.has(slot)) return NextResponse.json({ error: 'Invalid template image slot.' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image.' }, { status: 400 })
  const extension = allowedTypes.get(file.type)
  if (!extension || file.size < 1 || file.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'Use a JPG, PNG, or WebP image up to 4 MB.' }, { status: 400 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const safeSlot = slot.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  const path = `${auth.restaurantId}/templates/${safeSlot}-${Date.now()}.${extension}`
  const { error } = await auth.supabase.storage.from('restaurant-logos').upload(path, bytes, { contentType: file.type, cacheControl: '31536000', upsert: false })
  if (error) return NextResponse.json({ error: 'Could not upload template image. Check the restaurant-logos storage migration.' }, { status: 500 })
  const { data } = auth.supabase.storage.from('restaurant-logos').getPublicUrl(path)
  return NextResponse.json({ imageUrl: data.publicUrl, slot })
}
