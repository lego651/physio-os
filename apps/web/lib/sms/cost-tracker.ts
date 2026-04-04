import { createAdminClient } from '@/lib/supabase/admin'

const COST_PER_SEGMENT = 0.0079 // Twilio Canada rate
const ALERT_THRESHOLD = 40      // dollars

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7) // YYYY-MM
}

/**
 * Atomically increment segment count and cost estimate for the current month.
 * Uses a Supabase RPC (DB function) to avoid read-then-write race conditions
 * under concurrent SMS sends (e.g. during nudge cron).
 */
export async function trackSMSUsage(segments: number): Promise<void> {
  const supabase = createAdminClient()
  const month = currentMonthKey()

  const { error } = await supabase.rpc('increment_sms_usage', {
    p_month: month,
    p_segments: segments,
    p_cost: segments * COST_PER_SEGMENT,
  })

  if (error) {
    throw new Error(`[cost-tracker] Failed to increment sms_usage: ${error.message}`)
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
