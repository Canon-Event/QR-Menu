import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { MenuData } from '@/types'
import MenuTier1 from './components/MenuTier1'
import MenuTier2 from './components/MenuTier2'
import MenuTier3 from './components/MenuTier3'
import CustomerMenuActions from '@/components/menu/CustomerMenuActions'
import { googleFontStylesheetUrl, menuDesignVariables } from '@/lib/menu-fonts'
import MenuDocument from '@/components/menu/MenuDocument'
import BasicMenu from '@/components/menu/BasicMenu'
import CustomerRewards from '@/components/loyalty/CustomerRewards'
import type { LoyaltyProgram } from '@/lib/loyalty'

interface Props {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ table?: string }>
}

async function getMenuData(slug: string): Promise<MenuData | null> {
  const supabase = await createSupabaseServerClient()
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!restaurant) return null

  const [{ data: categories }, { data: dishes }, { data: addons }] =
    await Promise.all([
      supabase
        .from('categories')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('sort_order'),
      supabase
        .from('dishes')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('is_available', true)
        .order('sort_order'),
      supabase
        .from('addons')
        .select('addon_key')
        .eq('restaurant_id', restaurant.id),
    ])

  return {
    restaurant,
    categories: categories ?? [],
    dishes: dishes ?? [],
    addons: (addons ?? []).map((a) => a.addon_key),
  }
}

export default async function MenuPage({ params, searchParams }: Props) {
  const data = await getMenuData((await params).slug)
  if (!data) notFound()

  const { restaurant } = data
  const loyaltyClient = await createSupabaseServerClient()
  const { data: loyaltyProgram } = await loyaltyClient.from('loyalty_programs').select('*').eq('restaurant_id', restaurant.id).maybeSingle()
  const design = restaurant.template_settings?.[restaurant.template] || {}

  const menu = restaurant.menu_presentation === 'basic' ? <BasicMenu data={data} /> : ['A', 'B', 'C', 'D'].includes(restaurant.template) ? <MenuDocument data={data} /> : restaurant.tier === 3 ? <MenuTier3 data={data} /> : restaurant.tier === 2 ? <MenuTier2 data={data} /> : <MenuTier1 data={data} />
  const fontStylesheet = googleFontStylesheetUrl(design.font)
  const tableScan = (await searchParams)?.table || null
  return <div className={`menu-theme menu-theme-${restaurant.template.toLowerCase()}`} style={menuDesignVariables(design, restaurant.template) as React.CSSProperties}>{fontStylesheet && <link rel="stylesheet" href={fontStylesheet} />}{loyaltyProgram && (loyaltyProgram.enabled || loyaltyProgram.launched_at) && <CustomerRewards restaurant={restaurant} initialProgram={loyaltyProgram as LoyaltyProgram} />}{menu}<CustomerMenuActions restaurant={restaurant} dishes={data.dishes} tableScan={tableScan} /></div>
}

export async function generateMetadata({ params }: Props) {
  const supabase = await createSupabaseServerClient()
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name')
    .eq('slug', (await params).slug)
    .single()

  return {
    title: restaurant?.name ? `${restaurant.name} — Menu` : 'Menu',
  }
}
