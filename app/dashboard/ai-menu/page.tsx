import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import AiMenuImporter from '@/components/dashboard/AiMenuImporter'
import type { MenuData } from '@/types'

export default async function AiMenuPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/ai-menu')
  const { data: restaurant } = await supabase.from('restaurants').select('*').eq('owner_id', user.id).limit(1).maybeSingle()
  if (!restaurant) redirect('/dashboard/setup')
  const [{ data: categories }, { data: dishes }] = await Promise.all([
    supabase.from('categories').select('*').eq('restaurant_id', restaurant.id).order('sort_order'),
    supabase.from('dishes').select('*').eq('restaurant_id', restaurant.id).order('sort_order'),
  ])
  return <AiMenuImporter menu={{ restaurant, categories: categories || [], dishes: dishes || [], addons: [] } as MenuData} />
}
