import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import MenuTemplateGallery from '@/components/dashboard/MenuTemplateGallery'

export default async function TemplatesPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/templates')
  const { data: restaurant } = await supabase.from('restaurants').select('id,name,slug,template,template_settings').eq('owner_id', user.id).limit(1).maybeSingle()
  if (!restaurant) redirect('/dashboard/setup')
  return <MenuTemplateGallery restaurant={restaurant} />
}
