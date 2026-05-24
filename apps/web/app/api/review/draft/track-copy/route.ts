// apps/web/app/api/review/draft/track-copy/route.ts
//
// POST { token, event: 'copied' | 'regenerated' }
// Updates review_requests tracking columns. Best-effort — always 200.

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const bodySchema = z.object({
  token: z.string().min(1),
  event: z.enum(['copied', 'regenerated']),
})

export async function POST(req: Request) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return Response.json({ ok: true })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return Response.json({ ok: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: row } = await supabase
    .from('review_requests')
    .select('id, regenerated_count')
    .eq('token_jti', parsed.data.token)
    .single()

  if (!row) return Response.json({ ok: true })

  if (parsed.data.event === 'copied') {
    await supabase
      .from('review_requests')
      .update({ copied_at: new Date().toISOString() })
      .eq('id', row.id)
  } else {
    await supabase
      .from('review_requests')
      .update({ regenerated_count: (row.regenerated_count ?? 0) + 1 })
      .eq('id', row.id)
  }

  return Response.json({ ok: true })
}
