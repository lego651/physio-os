import { createAdminClient } from '@/lib/supabase/admin'
import { sendSMSWithRetry } from '@/lib/sms/send'

const E164_REGEX = /^\+[1-9]\d{7,14}$/

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, phone, language, condition } = body as Record<string, unknown>

  // --- Validation ---
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return Response.json({ error: 'Name is required' }, { status: 400 })
  }
  if (!phone || typeof phone !== 'string') {
    return Response.json({ error: 'Phone is required' }, { status: 400 })
  }
  if (!E164_REGEX.test(phone)) {
    return Response.json(
      { error: 'Phone must be in E.164 format (e.g. +16045551234)' },
      { status: 400 }
    )
  }
  const lang = typeof language === 'string' ? language : 'en'
  if (lang !== 'en' && lang !== 'zh') {
    return Response.json({ error: 'Language must be "en" or "zh"' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // --- Duplicate phone check ---
  const { data: existing } = await supabase
    .from('patients')
    .select('id')
    .eq('phone', phone)
    .maybeSingle()

  if (existing) {
    return Response.json(
      { error: 'A patient with this phone number already exists' },
      { status: 409 }
    )
  }

  // --- Insert patient ---
  const profileData =
    condition && typeof condition === 'string' ? { diagnosis: condition } : null

  const { data: patient, error: insertError } = await supabase
    .from('patients')
    .insert({
      name: name.trim(),
      phone,
      language: lang,
      profile: profileData,
      active: true,
      opted_out: false,
      consent_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (insertError || !patient) {
    console.error('[admin/patients] Insert failed:', insertError)
    return Response.json({ error: 'Failed to create patient' }, { status: 500 })
  }

  // --- Send welcome SMS (non-blocking on failure) ---
  const welcomeMessage =
    `Hi ${name.trim()}, you've been enrolled in V-Health's recovery coach. ` +
    `We'll check in on how you're feeling. Reply STOP to opt out.`

  try {
    await sendSMSWithRetry({ to: phone, body: welcomeMessage })
  } catch (smsError) {
    console.error('[admin/patients] Welcome SMS failed (patient still created):', smsError)
  }

  return Response.json(patient, { status: 201 })
}
