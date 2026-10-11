import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import MenuTemplateEditor from '@/components/dashboard/MenuTemplateEditor'

export default async function TemplateEditorPage({ params }: { params: Promise<{ template: string }> }) {
  const template = (await params).template.toUpperCase()
  if (!['A', 'B', 'C', 'D'].includes(template)) notFound()
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/dashboard/templates/${template}/edit`)
  const { data: restaurant } = await supabase.from('restaurants').select('id,template_settings').eq('owner_id', user.id).limit(1).maybeSingle()
  if (!restaurant) redirect('/dashboard/setup')
  const [{ data: categories }, { data: dishes }] = await Promise.all([
    supabase.from('categories').select('*').eq('restaurant_id', restaurant.id).order('sort_order'),
    supabase.from('dishes').select('category_id').eq('restaurant_id', restaurant.id),
  ])
  const categoryIds = new Set((categories || []).map(category => category.id))
  const uncategorizedCount = (dishes || []).filter(dish => !dish.category_id || !categoryIds.has(dish.category_id)).length
  return <MenuTemplateEditor template={template} categories={categories || []} uncategorizedCount={uncategorizedCount} savedDesign={restaurant.template_settings?.[template] || {}} />
}
