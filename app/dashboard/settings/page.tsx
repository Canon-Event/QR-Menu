import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { generateQRDataURL } from '@/lib/qr'
import SettingsManager from '@/components/dashboard/SettingsManager'
import type { Restaurant } from '@/types'
import RestaurantLogoUploader from '@/components/dashboard/RestaurantLogoUploader'

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; template?: string }> }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/settings')
  const { data } = await supabase.from('restaurants').select('*').eq('owner_id', user.id).limit(1).maybeSingle()
  if (!data) redirect('/dashboard/setup')
  const restaurant = data as Restaurant
  const qrDataUrl = await generateQRDataURL(restaurant.slug, { foreground: restaurant.qr_foreground, background: restaurant.qr_background, margin: restaurant.qr_margin })
  const displayName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : user.email?.split('@')[0] || ''
  const initialTab = (await searchParams).template ? 'templates' : (await searchParams).tab || 'restaurant'
  return <><SettingsManager restaurant={restaurant} displayName={displayName} email={user.email || ''} qrDataUrl={qrDataUrl} initialTab={initialTab} /><RestaurantLogoUploader initialUrl={restaurant.logo_url} restaurantName={restaurant.name} /></>
}
