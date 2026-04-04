import type { AdminClient } from '@/lib/supabase/admin'
import { sendSMS } from './send'

export type KeywordAction = 'stop' | 'start' | 'help' | null

/**
 * Twilio-recommended opt-out keywords (exact match only).
 * See: https://www.twilio.com/docs/messaging/guides/opt-out-keywords
 */
const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])

export function detectKeyword(body: string): KeywordAction {
  const trimmed = body.trim().toUpperCase()
  if (STOP_KEYWORDS.has(trimmed)) return 'stop'
  if (trimmed === 'START') return 'start'
  if (trimmed === 'HELP') return 'help'
  return null
}

export async function handleKeyword(
  action: KeywordAction,
  phone: string,
  supabase: AdminClient,
): Promise<string | null> {
  if (!action) return null

  if (action === 'stop') {
    await supabase.from('patients').update({ opted_out: true }).eq('phone', phone)
    return "You've been unsubscribed from V-Health Recovery Coach. Reply START to re-subscribe."
  }

  if (action === 'start') {
    await supabase.from('patients').update({ opted_out: false }).eq('phone', phone)
    return 'V-Health Recovery Coach: Welcome back! How are you feeling today? Reply STOP to unsubscribe.'
  }

  if (action === 'help') {
    return 'V-Health Recovery Coach helps you track your recovery. Reply STOP to unsubscribe. For urgent matters, call V-Health or 911.'
  }

  return null
}

/** Handle keyword detection and response. Returns true if a keyword was handled. */
export async function processKeyword(
  body: string,
  phone: string,
  supabase: AdminClient,
): Promise<boolean> {
  const keyword = detectKeyword(body)
  if (!keyword) return false

  const replyText = await handleKeyword(keyword, phone, supabase)
  if (replyText && keyword !== 'stop') {
    await sendSMS({ to: phone, body: replyText }).catch(err => {
      console.error('[sms] Failed to send keyword reply:', err)
    })
  }
  return true
}
