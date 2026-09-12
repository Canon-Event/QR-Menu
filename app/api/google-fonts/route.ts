import { NextResponse } from 'next/server'
import { getOwnedRestaurant } from '@/lib/menu-api'

type GoogleFont = { family: string; category: string; variants: string[] }

export async function GET() {
  const auth = await getOwnedRestaurant()
  if ('error' in auth) return auth.error
  const key = process.env.GOOGLE_FONTS_API_KEY
  if (!key) return NextResponse.json({ error: 'Google Fonts API is not configured.' }, { status: 503 })
  try {
    const response = await fetch(`https://www.googleapis.com/webfonts/v1/webfonts?sort=alpha&capability=WOFF2&key=${encodeURIComponent(key)}`, { next: { revalidate: 86400 } })
    if (!response.ok) return NextResponse.json({ error: 'Could not load Google Fonts. Check the API key and its Web Fonts API restriction.' }, { status: 502 })
    const result = await response.json() as { items?: GoogleFont[] }
    return NextResponse.json({ fonts: (result.items || []).map(({ family, category, variants }) => ({ family, category, variants })) }, { headers: { 'Cache-Control': 'private, max-age=3600' } })
  } catch {
    return NextResponse.json({ error: 'Google Fonts is temporarily unavailable.' }, { status: 502 })
  }
}
