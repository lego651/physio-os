import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@physio-os/shared'
import { requireEnv } from '@/lib/env'

export function createClient() {
  return createBrowserClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  )
}
