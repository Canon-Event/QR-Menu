import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { MenuData } from '@/types'
import MenuTier1 from './components/MenuTier1'
import MenuTier2 from './components/MenuTier2'
import MenuTier3 from './components/MenuTier3'
import CustomerMenuActions from '@/components/menu/CustomerMenuActions'
import { googleFontStylesheetUrl, menuDesignVariables } from '@/lib/menu-fonts'
import GreenBistroMenu from '@/components/menu/GreenBistroMenu'
import ItalianMenu from '@/components/menu/ItalianMenu'

interface Props {
  params: Promise<{ slug: string }>
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

export default async function MenuPage({ params }: Props) {
  const data = await getMenuData((await params).slug)
  if (!data) notFound()

  const { restaurant } = data
  const design = restaurant.template_settings?.[restaurant.template] || {}

  const menu = restaurant.template === 'A' ? <MenuTier1 data={data} /> : restaurant.template === 'B' ? <GreenBistroMenu data={data} /> : restaurant.template === 'C' ? <ItalianMenu data={data} /> : restaurant.tier === 3 ? <MenuTier3 data={data} /> : restaurant.tier === 2 ? <MenuTier2 data={data} /> : <MenuTier1 data={data} />
  const fontStylesheet = googleFontStylesheetUrl(design.font)
  return <div className={`menu-theme menu-theme-${restaurant.template.toLowerCase()}`} style={menuDesignVariables(design, restaurant.template) as React.CSSProperties}>{fontStylesheet && <link rel="stylesheet" href={fontStylesheet} />}{menu}<CustomerMenuActions restaurant={restaurant} dishes={data.dishes} /></div>
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
