// apps/web/app/r/gmap/route.ts
//
// GET /r/gmap?t={token_jti}
// Validates the token, records the click, then 302-redirects to Google Maps review URL.

import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GOOGLE_FALLBACK = 'https://www.google.com/maps/place/V-Health+Rehab/'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const t = searchParams.get('t')
  if (!t) {
    return new Response('Missing token', { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: row } = await supabase
    .from('review_requests')
    .select('id, status, expires_at')
    .eq('token_jti', t)
    .single()

  if (
    !row ||
    row.status === 'revoked' ||
    row.status === 'expired' ||
    new Date(row.expires_at) < new Date()
  ) {
    return new Response('Not found', { status: 404 })
  }

  // Best-effort tracking — do not block redirect on failure.
  await supabase
    .from('review_requests')
    .update({ clicked_at: new Date().toISOString(), clicked_channel: 'gmap' })
    .eq('id', row.id)

  const dest = process.env.VHEALTH_GOOGLE_REVIEW_URL ?? GOOGLE_FALLBACK
  return Response.redirect(dest, 302)
}
