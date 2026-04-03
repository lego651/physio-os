import { createAdminClient } from '@/lib/supabase/admin'

const COST_PER_SEGMENT = 0.0079 // Twilio Canada rate
const ALERT_THRESHOLD = 40      // dollars

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7) // YYYY-MM
}

/**
 * Increment segment count and cost estimate for the current month.
 * Reads the current row first, then upserts with the accumulated totals.
 * Not atomic under concurrent writes, but SMS sends are low-frequency enough
 * that this is acceptable without a DB-side function.
 */
export async function trackSMSUsage(segments: number): Promise<void> {
  const supabase = createAdminClient()
  const month = currentMonthKey()

  const { data: existing, error: readError } = await supabase
    .from('sms_usage')
    .select('segments, cost_estimate')
    .eq('month', month)
    .maybeSingle()

  if (readError) {
    throw new Error(`[cost-tracker] Failed to read sms_usage: ${readError.message}`)
  }

  const newSegments = (existing?.segments ?? 0) + segments
  const newCost = Number(existing?.cost_estimate ?? 0) + segments * COST_PER_SEGMENT

  const { error: upsertError } = await supabase
    .from('sms_usage')
    .upsert({
      month,
      segments: newSegments,
      cost_estimate: newCost,
      updated_at: new Date().toISOString(),
    })

  if (upsertError) {
    throw new Error(`[cost-tracker] Failed to upsert sms_usage: ${upsertError.message}`)
  }
}

/**
 * Return true if the current month's cost estimate exceeds the alert threshold.
 */
export async function checkCostAlert(): Promise<boolean> {
  const supabase = createAdminClient()
  const month = currentMonthKey()

  const { data, error } = await supabase
    .from('sms_usage')
    .select('cost_estimate')
    .eq('month', month)
    .maybeSingle()

  if (error) {
    console.error('[cost-tracker] Failed to query sms_usage for alert check:', error.message)
    return false
  }

  return Number(data?.cost_estimate ?? 0) > ALERT_THRESHOLD
}

/**
 * Return usage totals for the current calendar month.
 */
export async function getCurrentMonthUsage(): Promise<{
  month: string
  segments: number
  costEstimate: number
}> {
  const supabase = createAdminClient()
  const month = currentMonthKey()

  const { data, error } = await supabase
    .from('sms_usage')
    .select('segments, cost_estimate')
    .eq('month', month)
    .maybeSingle()

  if (error) {
    throw new Error(`[cost-tracker] Failed to query sms_usage: ${error.message}`)
  }

  return {
    month,
    segments: data?.segments ?? 0,
    costEstimate: Number(data?.cost_estimate ?? 0),
  }
}
