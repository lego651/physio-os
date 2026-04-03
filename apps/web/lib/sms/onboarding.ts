import type { AdminClient } from '@/lib/supabase/admin'
import type { Database } from '@physio-os/shared'
import { sendSMS } from './send'

type PatientRow = Database['public']['Tables']['patients']['Row']

/**
 * Handle SMS onboarding for patients without complete profiles (S304).
 * Stateless: checks which fields are missing and asks for the next one.
 *
 * Persists both user and assistant messages to the messages table for audit trail.
 */
export async function handleSMSOnboarding(
  supabase: AdminClient,
  patient: Pick<PatientRow, 'id' | 'name' | 'language' | 'consent_at' | 'profile'>,
  messageBody: string,
  phone: string,
) {
  const profile = (patient.profile || {}) as Record<string, unknown>
  const trimmed = messageBody.trim()
  const upper = trimmed.toUpperCase()

  // Step 1: Consent
  if (!patient.consent_at) {
    if (upper === 'YES') {
      const { error } = await supabase
        .from('patients')
        .update({ consent_at: new Date().toISOString() })
        .eq('id', patient.id)
      if (error) {
        console.error('[sms] Failed to update consent:', error)
        await sendAndSave(supabase, patient.id, phone, 'Something went wrong. Please try again by replying YES.')
        return
      }
      await sendAndSave(supabase, patient.id, phone, 'Great! What should we call you?')
    } else if (upper === 'STOP') {
      const { error } = await supabase
        .from('patients')
        .update({ opted_out: true })
        .eq('id', patient.id)
      if (error) console.error('[sms] Failed to opt out patient:', error)
    } else {
      const privacyUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vhealth.ai'
      await sendAndSave(
        supabase,
        patient.id,
        phone,
        `Welcome to V-Health Recovery Coach! By continuing, you agree to our privacy policy: ${privacyUrl}/privacy. Reply YES to continue or STOP to opt out.`,
      )
    }
    return
  }

  // Step 2: Name
  if (!patient.name) {
    const name = trimmed.slice(0, 200)
    const { error } = await supabase.from('patients').update({ name }).eq('id', patient.id)
    if (error) {
      console.error('[sms] Failed to update name:', error)
      await sendAndSave(supabase, patient.id, phone, 'Something went wrong. Please try again with your name.')
      return
    }
    await sendAndSave(supabase, patient.id, phone, 'What brings you to V-Health? (e.g., back pain, shoulder injury)')
    return
  }

  // Step 3: Condition (injury)
  if (!profile.injury) {
    const injury = trimmed.slice(0, 200)
    const { error } = await supabase
      .from('patients')
      .update({ profile: { ...profile, injury } })
      .eq('id', patient.id)
    if (error) {
      console.error('[sms] Failed to update injury:', error)
      await sendAndSave(supabase, patient.id, phone, 'Something went wrong. Please try again.')
      return
    }
    await sendAndSave(supabase, patient.id, phone, 'Preferred language? Reply 1 for English, 2 for 中文')
    return
  }

  // Step 4: Language
  if (patient.language === 'en' && !profile._languageSet) {
    let language = 'en'
    if (trimmed === '2') language = 'zh'
    else if (trimmed !== '1' && trimmed !== '2') {
      await sendAndSave(supabase, patient.id, phone, 'Please reply 1 for English or 2 for 中文')
      return
    }
    const { error } = await supabase
      .from('patients')
      .update({ language, profile: { ...profile, _languageSet: true } })
      .eq('id', patient.id)
    if (error) {
      console.error('[sms] Failed to update language:', error)
      await sendAndSave(supabase, patient.id, phone, 'Something went wrong. Please try again.')
      return
    }
    await sendAndSave(
      supabase,
      patient.id,
      phone,
      `You're all set, ${patient.name}! How are you feeling right now? Rate your discomfort 0-3 (0=none, 1=mild, 2=moderate, 3=severe).`,
    )
    return
  }
}

/** Send an SMS and persist the assistant message for audit trail. */
async function sendAndSave(
  supabase: AdminClient,
  patientId: string,
  phone: string,
  body: string,
) {
  await sendSMS({ to: phone, body }).catch(err => {
    console.error('[sms] Failed to send onboarding message:', err)
  })
  await supabase.from('messages').insert({
    patient_id: patientId,
    role: 'assistant',
    content: body,
    channel: 'sms',
  })
}
