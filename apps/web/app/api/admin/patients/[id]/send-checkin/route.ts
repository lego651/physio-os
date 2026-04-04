import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSMSWithRetry } from '@/lib/sms/send'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  // Get patient
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('id, name, phone, opted_out, active')
    .eq('id', id)
    .maybeSingle()

  if (patientError) {
    return NextResponse.json({ error: patientError.message }, { status: 500 })
  }
  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }
  if (patient.opted_out) {
    return NextResponse.json({ error: 'Patient has opted out' }, { status: 400 })
  }
  if (!patient.phone) {
    return NextResponse.json({ error: 'Patient has no phone number' }, { status: 400 })
  }

  // Rate limit: max 1 admin check-in per patient per day
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', id)
    .eq('role', 'assistant')
    .eq('channel', 'sms')
    .gte('created_at', todayStart.toISOString())

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Check-in already sent today. Max 1 per patient per day.' },
      { status: 429 }
    )
  }

  // Get message body from request or use default
  const body = await request.json().catch(() => ({})) as { message?: string }
  const messageText = body.message ||
    `Hi ${patient.name ?? 'there'}, this is V-Health. How are you feeling? We'd love to hear an update.`

  // Send SMS
  try {
    await sendSMSWithRetry({ to: patient.phone, body: messageText })
  } catch (err) {
    console.error('[send-checkin] SMS failed:', err)
    return NextResponse.json({ error: 'Failed to send. Please try again.' }, { status: 500 })
  }

  // Save to DB
  await supabase.from('messages').insert({
    patient_id: id,
    role: 'assistant',
    content: messageText,
    channel: 'sms',
  })

  return NextResponse.json({ success: true })
}
