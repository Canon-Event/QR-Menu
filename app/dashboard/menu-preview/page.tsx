import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { MenuData } from '@/types'
import MenuTier1 from '@/app/menu/[slug]/components/MenuTier1'
import MenuTier2 from '@/app/menu/[slug]/components/MenuTier2'
import MenuTier3 from '@/app/menu/[slug]/components/MenuTier3'
import { googleFontStylesheetUrl, menuDesignVariables } from '@/lib/menu-fonts'
import TemplateEditorPreviewBridge from '@/components/dashboard/TemplateEditorPreviewBridge'
import GreenBistroMenu from '@/components/menu/GreenBistroMenu'
import ItalianMenu from '@/components/menu/ItalianMenu'

export default async function DashboardMenuPreview({ searchParams }: { searchParams: Promise<{ template?: string; embedded?: string }> }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/templates')
  const { data: restaurant } = await supabase.from('restaurants').select('*').eq('owner_id', user.id).limit(1).maybeSingle()
  if (!restaurant) redirect('/dashboard/setup')
  const template = ['A', 'B', 'C'].includes((await searchParams).template || '') ? (await searchParams).template! : restaurant.template
  const [{ data: categories }, { data: dishes }, { data: addons }] = await Promise.all([
    supabase.from('categories').select('*').eq('restaurant_id', restaurant.id).order('sort_order'),
    supabase.from('dishes').select('*').eq('restaurant_id', restaurant.id).eq('is_available', true).order('sort_order'),
    supabase.from('addons').select('addon_key').eq('restaurant_id', restaurant.id),
  ])
  const data = { restaurant: { ...restaurant, template }, categories: categories || [], dishes: dishes || [], addons: (addons || []).map(item => item.addon_key) } as MenuData
  const design = data.restaurant.template_settings?.[template] || {}
  const fontStylesheet = googleFontStylesheetUrl(design.font)
  const selectedMenu = template === 'A' ? <MenuTier1 data={data} /> : template === 'B' ? <GreenBistroMenu data={data} /> : template === 'C' ? <ItalianMenu data={data} /> : restaurant.tier === 3 ? <MenuTier3 data={data} /> : restaurant.tier === 2 ? <MenuTier2 data={data} /> : <MenuTier1 data={data} />
  const menu = <><TemplateEditorPreviewBridge template={template} />{selectedMenu}</>
  return <main className={`dashboard-menu-preview ${(await searchParams).embedded === '1' ? 'is-embedded' : ''}`} style={menuDesignVariables(design, template) as React.CSSProperties}>{fontStylesheet && <link rel="stylesheet" href={fontStylesheet} />}{(await searchParams).embedded !== '1' && <div className="dashboard-preview-bar"><a href="/dashboard/templates">← Templates</a><span>Previewing Template {template}</span><a href={`/menu/${restaurant.slug}`} target="_blank" rel="noopener noreferrer">Open active menu ↗</a></div>}{menu}</main>
}
