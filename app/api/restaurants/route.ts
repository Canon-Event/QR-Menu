import { readJsonBody } from '@/lib/request-security'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  const body = (await readJsonBody(request) ?? {})
  const ownerName = typeof body?.ownerName === 'string' ? body.ownerName.trim() : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const logoUrl = typeof body?.logoUrl === 'string' ? body.logoUrl.trim() : ''
  const template = body?.template === 'B' || body?.template === 'C' ? body.template : 'A'

  if (ownerName.length < 2 || ownerName.length > 100) return NextResponse.json({ error: 'Your name must be between 2 and 100 characters.' }, { status: 400 })
  if (name.length < 2 || name.length > 100) return NextResponse.json({ error: 'Restaurant name must be between 2 and 100 characters.' }, { status: 400 })
  if (!slugPattern.test(slug) || slug.length < 3 || slug.length > 50) return NextResponse.json({ error: 'Use 3–50 lowercase letters, numbers, and hyphens for your menu URL.' }, { status: 400 })
  if (logoUrl && !/^https:\/\//i.test(logoUrl)) return NextResponse.json({ error: 'Logo URL must use HTTPS.' }, { status: 400 })

  const { data: existing, error: lookupError } = await supabase.from('restaurants').select('id').eq('slug', slug).maybeSingle()
  if (lookupError) return NextResponse.json({ error: getDatabaseErrorMessage(lookupError) }, { status: 503 })
  if (existing) return NextResponse.json({ error: 'That menu URL is already taken.' }, { status: 409 })

  const { data: restaurant, error } = await supabase.from('restaurants').insert({ owner_id: user.id, name, slug, logo_url: logoUrl || null, template, tier: 1, is_active: true }).select('id, slug').single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'That menu URL is already taken.' }, { status: 409 })
    return NextResponse.json({ error: getDatabaseErrorMessage(error) }, { status: 503 })
  }

  await supabase.auth.updateUser({ data: { full_name: ownerName } })

  return NextResponse.json({ restaurant }, { status: 201 })
}

function getDatabaseErrorMessage(error: { code?: string }) {
  if (error.code === '42P01' || error.code === 'PGRST205') return 'The database is not initialized yet. Run supabase/schema.sql in your Supabase SQL Editor, then try again.'
  if (error.code === '42501' || error.code === 'PGRST301') return 'Your account does not have permission to create a restaurant. Check the restaurants RLS policy.'
  return 'We could not create your restaurant right now. Please try again.'
}
