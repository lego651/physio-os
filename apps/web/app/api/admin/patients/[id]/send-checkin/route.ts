import { createAdminClient } from '@/lib/supabase/admin'
import { sendSMSWithRetry } from '@/lib/sms/send'
import { requireAdminAuth } from '@/lib/auth/require-admin'
import { isValidUUID } from '@/lib/validation'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth()
  if (auth.error) return auth.error

  const { id } = await params
  if (!isValidUUID(id)) {
    return Response.json({ error: 'Invalid patient ID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Get patient
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('id, name, phone, opted_out, active')
    .eq('id', id)
    .maybeSingle()

  if (patientError) {
    console.error('[send-checkin] Patient lookup failed:', patientError)
    return Response.json({ error: 'Failed to look up patient' }, { status: 500 })
  }
  if (!patient) {
    return Response.json({ error: 'Patient not found' }, { status: 404 })
  }
  if (!patient.active) {
    return Response.json({ error: 'Patient is inactive' }, { status: 400 })
  }
  if (patient.opted_out) {
    return Response.json({ error: 'Patient has opted out' }, { status: 400 })
  }
  if (!patient.phone) {
    return Response.json({ error: 'Patient has no phone number' }, { status: 400 })
  }

  // Rate limit: max 1 admin check-in per patient per day (UTC)
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', id)
    .eq('role', 'assistant')
    .eq('channel', 'sms')
    .gte('created_at', todayStart.toISOString())
    .contains('metadata', { admin_initiated: true })

  if ((count ?? 0) > 0) {
    return Response.json(
      { error: 'Check-in already sent today. Max 1 per patient per day.' },
      { status: 429 }
    )
  }

  // Get message body from request or use default
  const MAX_MESSAGE_LENGTH = 1600 // 10 SMS segments — hard ceiling
  const body = await request.json().catch(() => ({})) as { message?: string }

  if (body.message !== undefined) {
    if (typeof body.message !== 'string') {
      return Response.json({ error: 'message must be a string' }, { status: 400 })
    }
    if (body.message.trim().length === 0) {
      return Response.json({ error: 'message must not be empty' }, { status: 400 })
    }
    if (body.message.length > MAX_MESSAGE_LENGTH) {
      return Response.json(
        { error: `message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters` },
        { status: 400 },
      )
    }
  }

  const messageText = (typeof body.message === 'string' && body.message.trim().length > 0)
    ? body.message.trim()
    : `Hi ${patient.name ?? 'there'}, this is V-Health. How are you feeling? We'd love to hear an update.`

  // Send SMS
  try {
    await sendSMSWithRetry({ to: patient.phone, body: messageText })
  } catch (err) {
    console.error('[send-checkin] SMS failed:', err)
    return Response.json({ error: 'Failed to send. Please try again.' }, { status: 500 })
  }

  // Save to DB with admin_initiated metadata
  await supabase.from('messages').insert({
    patient_id: id,
    role: 'assistant',
    content: messageText,
    channel: 'sms',
    metadata: { admin_initiated: true },
  })

  return Response.json({ success: true })
}
