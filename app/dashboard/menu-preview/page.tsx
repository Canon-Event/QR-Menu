import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { MenuData } from '@/types'
import { googleFontStylesheetUrl, menuDesignVariables } from '@/lib/menu-fonts'
import TemplateEditorPreviewBridge from '@/components/dashboard/TemplateEditorPreviewBridge'

export default async function DashboardMenuPreview({ searchParams }: { searchParams: Promise<{ template?: string; embedded?: string }> }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/templates')
  const { data: restaurant } = await supabase.from('restaurants').select('*').eq('owner_id', user.id).limit(1).maybeSingle()
  if (!restaurant) redirect('/dashboard/setup')
  const template = ['A', 'B', 'C', 'D'].includes((await searchParams).template || '') ? (await searchParams).template! : restaurant.template
  const [{ data: categories }, { data: dishes }, { data: addons }] = await Promise.all([
    supabase.from('categories').select('*').eq('restaurant_id', restaurant.id).order('sort_order'),
    supabase.from('dishes').select('*').eq('restaurant_id', restaurant.id).eq('is_available', true).order('sort_order'),
    supabase.from('addons').select('addon_key').eq('restaurant_id', restaurant.id),
  ])
  const data = { restaurant: { ...restaurant, template }, categories: categories || [], dishes: dishes || [], addons: (addons || []).map(item => item.addon_key) } as MenuData
  const design = data.restaurant.template_settings?.[template] || {}
  const fontStylesheet = googleFontStylesheetUrl(design.font)
  const menu = <TemplateEditorPreviewBridge data={data} />
  return <main className={`dashboard-menu-preview ${(await searchParams).embedded === '1' ? 'is-embedded' : ''}`} style={menuDesignVariables(design, template) as React.CSSProperties}>{fontStylesheet && <link rel="stylesheet" href={fontStylesheet} />}{(await searchParams).embedded !== '1' && <div className="dashboard-preview-bar"><a href="/dashboard/templates">← Templates</a><span>Previewing Template {template}</span><a href={`/menu/${restaurant.slug}`} target="_blank" rel="noopener noreferrer">Open active menu ↗</a></div>}{menu}</main>
}
