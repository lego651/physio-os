// apps/web/app/api/review-requests/unsubscribe/route.ts
import { verifyReviewToken } from '@/lib/review/tokens'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordOptOut } from '@/lib/review/opt-outs'

export const runtime = 'nodejs'

interface ReviewRequestContactRow {
  id: string
  patient_email: string | null
  patient_phone: string | null
  clinic_id: string
}

async function doUnsubscribe(token: string | null): Promise<'ok' | 'invalid'> {
  if (!token) return 'invalid'
  const decoded = await verifyReviewToken(token)
  if (!decoded) return 'invalid'

  // createAdminClient returns an untyped Supabase client (no generated schema yet).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data, error } = await supabase
    .from('review_requests')
    .select('id, patient_email, patient_phone, clinic_id')
    .eq('id', decoded.requestId)
    .single()
  if (error || !data) return 'invalid'

  const row = data as ReviewRequestContactRow
  if (row.patient_email) {
    await recordOptOut(supabase, {
      clinicId: row.clinic_id,
      contact: row.patient_email,
      contactType: 'email',
      source: 'email_link',
    })
  }
  if (row.patient_phone) {
    await recordOptOut(supabase, {
      clinicId: row.clinic_id,
      contact: row.patient_phone,
      contactType: 'sms',
      source: 'email_link',
    })
  }
  return 'ok'
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const result = await doUnsubscribe(token)
  if (result === 'invalid') return Response.json({ error: 'Invalid token' }, { status: 401 })
  return Response.redirect(`${url.origin}/review/${token}/unsubscribed`, 302)
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const token =
    body !== null && typeof body === 'object' && 'token' in body && typeof body.token === 'string'
      ? body.token
      : null
  const result = await doUnsubscribe(token)
  if (result === 'invalid') return Response.json({ error: 'Invalid token' }, { status: 401 })
  return Response.json({ ok: true })
}
