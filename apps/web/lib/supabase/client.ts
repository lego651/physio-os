import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@physio-os/shared'

// Use literal process.env.* access (not requireEnv helper) so Next.js can
// statically replace these at build time for the browser bundle. Dynamic
// process.env[key] access stays as `process.env[...]` in the bundle, which
// throws "process is not defined" in the browser.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  if (!anonKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY')
  return createBrowserClient<Database>(url, anonKey)
}
