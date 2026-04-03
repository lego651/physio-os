import { createClient } from '@supabase/supabase-js'
import type { Database } from '@physio-os/shared'

/** Create a Supabase admin client (service role — bypasses RLS) */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase config')
  return createClient<Database>(url, serviceKey)
}

export type AdminClient = ReturnType<typeof createAdminClient>
