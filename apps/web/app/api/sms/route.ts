import { normalizePhone } from '@physio-os/shared'
import { validateTwilioSignature } from '@/lib/sms/validate'
import { checkRateLimit } from '@/lib/sms/rate-limit'
import { processKeyword } from '@/lib/sms/keywords'
import { processMessageAsync, PATIENT_SMS_SELECT } from '@/lib/sms/process'
import { createAdminClient } from '@/lib/supabase/admin'
import { waitUntil } from '@vercel/functions'

// TODO(2026-Q3): measure p95 latency under real load and tune maxDuration
export const maxDuration = 25

/** Parse Twilio's application/x-www-form-urlencoded webhook body */
function parseTwilioBody(formData: FormData): Record<string, string> {
  const params: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    params[key] = String(value)
  }
  return params
}

export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.error('[sms] Missing TWILIO_AUTH_TOKEN')
    return new Response('Server configuration error', { status: 500 })
  }

  // Validate Twilio signature
  const signature = req.headers.get('x-twilio-signature') || ''
  const formData = await req.formData()
  const params = parseTwilioBody(formData)

  const forwardedProto = req.headers.get('x-forwarded-proto')
  const forwardedHost = req.headers.get('x-forwarded-host')
  const requestUrl = new URL(req.url)
  const webhookUrl = forwardedHost
    ? `${forwardedProto || 'https'}://${forwardedHost}${requestUrl.pathname}`
    : `${requestUrl.origin}${requestUrl.pathname}`

  if (!validateTwilioSignature(authToken, signature, webhookUrl, params)) {
    return new Response('Invalid signature', { status: 403 })
  }

  // Parse webhook payload
  const messageSid = params.MessageSid || ''
  const body = params.Body || ''
  const from = params.From || ''
  const numMedia = parseInt(params.NumMedia || '0', 10)

  if (!messageSid || !from) {
    return new Response('Missing required fields', { status: 400 })
  }

  const supabase = createAdminClient()

  // Idempotency check
  const { data: existingMsg } = await supabase
    .from('messages')
    .select('id')
    .eq('twilio_sid', messageSid)
    .maybeSingle()

  if (existingMsg) return new Response('OK', { status: 200 })

  // Normalize phone number
  let normalizedPhone: string
  try {
    normalizedPhone = normalizePhone(from)
  } catch {
    console.error('[sms] Invalid phone number:', from)
    return new Response('OK', { status: 200 })
  }

  // STOP/START/HELP keyword handling — before any other processing
  const handled = await processKeyword(body, normalizedPhone, supabase)
  if (handled) return new Response('OK', { status: 200 })

  // Rate limit check
  if (!(await checkRateLimit(normalizedPhone))) {
    console.warn('[sms] Rate limited:', normalizedPhone)
    return new Response('OK', { status: 200 })
  }

  // Identify patient
  const { data: patient } = await supabase
    .from('patients')
    .select(PATIENT_SMS_SELECT)
    .eq('phone', normalizedPhone)
    .maybeSingle()

  if (patient?.opted_out) return new Response('OK', { status: 200 })

  // Return 200 immediately — process async
  waitUntil(processMessageAsync({
    supabase,
    patient,
    normalizedPhone,
    body,
    messageSid,
    numMedia,
    params,
    isNewPatient: !patient,
  }))

  return new Response('OK', { status: 200 })
}
