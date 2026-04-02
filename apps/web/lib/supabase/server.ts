import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@physio-os/shared'
import { requireEnv } from '@/lib/env'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // setAll can be called from Server Components where cookies are read-only.
            // This can be safely ignored when running in that context.
          }
        },
      },
    },
  )
}

export async function createServiceClient() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  )
}
