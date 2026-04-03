import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@physio-os/shared'

type PatientRow = Database['public']['Tables']['patients']['Row']
type MessageRow = Database['public']['Tables']['messages']['Row']
type MetricRow = Database['public']['Tables']['metrics']['Row']

export interface ConversationContext {
  profile: PatientRow
  messages: MessageRow[]
  recentMetrics: MetricRow[]
  conversationCount: number
}

const MAX_TOKEN_BUDGET = 4000
const CHARS_PER_TOKEN_LATIN = 4
const CHARS_PER_TOKEN_CJK = 1.5

// Detect CJK characters (Chinese, Japanese, Korean)
const CJK_RANGE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/

function charsPerToken(text: string): number {
  // Count CJK characters
  const cjkCount = (text.match(new RegExp(CJK_RANGE.source, 'g')) || []).length
  const totalLen = text.length
  if (totalLen === 0) return CHARS_PER_TOKEN_LATIN
  const cjkRatio = cjkCount / totalLen
  // Weighted average
  return cjkRatio * CHARS_PER_TOKEN_CJK + (1 - cjkRatio) * CHARS_PER_TOKEN_LATIN
}

export function estimateTokens(text: string): number {
  const ratio = charsPerToken(text)
  return Math.ceil(text.length / ratio)
}

export async function buildContext(
  patientId: string,
  supabase: SupabaseClient<Database>,
): Promise<ConversationContext> {
  // Load patient profile first (validates patient exists)
  const { data: profile, error: profileError } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .single()

  if (profileError || !profile) {
    throw new Error(`Patient not found: ${patientId}`)
  }

  // Run remaining queries in parallel — all independent after profile validation
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const [messagesResult, countResult, metricsResult] = await Promise.all([
    supabase
      .from('messages')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('patient_id', patientId)
      .eq('role', 'user'),
    supabase
      .from('metrics')
      .select('*')
      .eq('patient_id', patientId)
      .gte('recorded_at', sevenDaysAgo.toISOString())
      .order('recorded_at', { ascending: false }),
  ])

  if (messagesResult.error) {
    throw new Error(`Failed to load messages: ${messagesResult.error.message}`)
  }

  if (metricsResult.error) {
    throw new Error(`Failed to load metrics: ${metricsResult.error.message}`)
  }

  // Budget messages within token limit
  const messages = budgetMessages(messagesResult.data || [])

  return {
    profile,
    messages,
    recentMetrics: metricsResult.data || [],
    conversationCount: countResult.count || 0,
  }
}

export function budgetMessages(messagesNewestFirst: MessageRow[]): MessageRow[] {
  let totalChars = 0
  const budgeted: MessageRow[] = []

  // Compute max chars based on content language
  const sampleText = messagesNewestFirst.slice(0, 5).map(m => m.content).join('')
  const ratio = charsPerToken(sampleText)
  const maxChars = MAX_TOKEN_BUDGET * ratio

  for (const msg of messagesNewestFirst) {
    const msgChars = msg.content.length
    if (totalChars + msgChars > maxChars) break
    budgeted.push(msg)
    totalChars += msgChars
  }

  // Return in chronological order (oldest first) for conversation flow
  return budgeted.reverse()
}
