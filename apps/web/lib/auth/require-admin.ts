import { createClient } from '@/lib/supabase/server'

/**
 * Validates that the current request comes from an authenticated admin user.
 * Uses the Supabase session from cookies (set by middleware).
 *
 * Returns the authenticated user on success, or a Response on failure.
 */
export async function requireAdminAuth(): Promise<
  | { user: { id: string; email: string }; error?: never }
  | { user?: never; error: Response }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !user.email) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) {
    console.error('[require-admin] ADMIN_EMAIL env var is not set — all admin access denied')
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  if (user.email !== adminEmail) {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user: { id: user.id, email: user.email } }
}
