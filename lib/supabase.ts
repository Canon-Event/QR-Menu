import 'server-only'
import { createClient } from '@supabase/supabase-js'

function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required. Configure it in the deployment environment.')
  return url
}

// Create clients lazily so Next.js route collection does not require secrets at build time.
export const supabase = () => createClient(supabaseUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')

// Server-side only; never expose the service-role client to browser code.
export const supabaseAdmin = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server-side Supabase operations.')
  return createClient(supabaseUrl(), key)
}
