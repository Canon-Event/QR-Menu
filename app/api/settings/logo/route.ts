import { readFormBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { getOwnedRestaurant, rejectUnsafeRequest } from '@/lib/menu-api'

const allowed = new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp']])

export async function POST(request: Request) {
  const unsafe = rejectUnsafeRequest(request, true); if (unsafe) return unsafe
  const auth = await getOwnedRestaurant(); if ('error' in auth) return auth.error
  const form = await readFormBody(request).catch(() => null)
  const file = form?.get('logo')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a logo image.' }, { status: 400 })
  const extension = allowed.get(file.type)
  if (!extension || file.size < 1 || file.size > 2 * 1024 * 1024) return NextResponse.json({ error: 'Use a JPG, PNG, or WebP image up to 2 MB.' }, { status: 400 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const path = `${auth.restaurantId}/logo-${Date.now()}.${extension}`
  const { error: uploadError } = await auth.supabase.storage.from('restaurant-logos').upload(path, bytes, { contentType: file.type, cacheControl: '31536000', upsert: false })
  if (uploadError) return NextResponse.json({ error: 'Could not upload logo. Run the updated Phase 5 SQL migration.' }, { status: 500 })
  const { data: publicData } = auth.supabase.storage.from('restaurant-logos').getPublicUrl(path)
  const logoUrl = publicData.publicUrl
  const { error: updateError } = await auth.supabase.from('restaurants').update({ logo_url: logoUrl }).eq('id', auth.restaurantId)
  if (updateError) { await auth.supabase.storage.from('restaurant-logos').remove([path]); return NextResponse.json({ error: 'Could not save the uploaded logo.' }, { status: 500 }) }
  return NextResponse.json({ logoUrl })
}
