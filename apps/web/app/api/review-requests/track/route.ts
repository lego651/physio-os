// apps/web/app/api/review-requests/track/route.ts
import { z } from 'zod'
import { verifyReviewToken } from '@/lib/review/tokens'
import { createAdminClient } from '@/lib/supabase/admin'
import { logFunnelEvent } from '@/lib/review/events'

export const runtime = 'nodejs'

const ALLOWED_CLIENT_EVENTS = ['link_clicked', 'copy_clicked', 'maps_redirected'] as const

const bodySchema = z.object({
  token: z.string().min(1),
  eventType: z.enum(ALLOWED_CLIENT_EVENTS),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(req: Request) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const decoded = await verifyReviewToken(parsed.data.token)
  if (!decoded) return Response.json({ error: 'Invalid or expired token' }, { status: 401 })

  const supabase = createAdminClient()
  await logFunnelEvent(supabase, {
    requestId: decoded.requestId,
    eventType: parsed.data.eventType,
    metadata: parsed.data.metadata,
  })

  return Response.json({ ok: true })
}
