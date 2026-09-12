'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

interface Props {
  displayName: string
  restaurantName: string
}
import { IconLogOut } from '@/components/marketing/Icons'

export default function DashboardIdentity({ displayName, restaurantName }: Props) {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [email, setEmail] = useState('')

  useEffect(() => {
    let active = true

    supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? '')
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setEmail(session?.user?.email ?? '')
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const initials = displayName.slice(0, 2).toUpperCase()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="profile" title={email || restaurantName}>
      <span>{initials}</span>
      <div><b>{displayName}</b><small><i className="signed-in-dot" /> Signed in</small></div>
      <button className="profile-signout" type="button" onClick={signOut} aria-label="Sign out" title="Sign out"><IconLogOut className="h-4 w-4" /></button>
    </div>
  )
}
