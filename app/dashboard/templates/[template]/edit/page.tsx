import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import MenuTemplateEditor from '@/components/dashboard/MenuTemplateEditor'

export default async function TemplateEditorPage({ params }: { params: Promise<{ template: string }> }) {
  const template = (await params).template.toUpperCase()
  if (!['A', 'B', 'C'].includes(template)) notFound()
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/dashboard/templates/${template}/edit`)
  const { data: restaurant } = await supabase.from('restaurants').select('template_settings').eq('owner_id', user.id).limit(1).maybeSingle()
  if (!restaurant) redirect('/dashboard/setup')
  return <MenuTemplateEditor template={template} savedDesign={restaurant.template_settings?.[template] || {}} />
}
