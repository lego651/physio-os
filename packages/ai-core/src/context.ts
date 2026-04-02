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
const CHARS_PER_TOKEN = 4
const MAX_CHARS = MAX_TOKEN_BUDGET * CHARS_PER_TOKEN // 16,000 characters

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export async function buildContext(
  patientId: string,
  supabase: SupabaseClient<Database>,
): Promise<ConversationContext> {
  // Load patient profile
  const { data: profile, error: profileError } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .single()

  if (profileError || !profile) {
    throw new Error(`Patient not found: ${patientId}`)
  }

  // Load messages in reverse chronological order (newest first for budgeting)
  const { data: allMessages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (messagesError) {
    throw new Error(`Failed to load messages: ${messagesError.message}`)
  }

  // Budget messages within token limit
  const messages = budgetMessages(allMessages || [])

  // Count total conversations (user messages) for scale education
  const { count: conversationCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('patient_id', patientId)
    .eq('role', 'user')

  // Load last 7 days of metrics
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: recentMetrics, error: metricsError } = await supabase
    .from('metrics')
    .select('*')
    .eq('patient_id', patientId)
    .gte('recorded_at', sevenDaysAgo.toISOString())
    .order('recorded_at', { ascending: false })

  if (metricsError) {
    throw new Error(`Failed to load metrics: ${metricsError.message}`)
  }

  return {
    profile,
    messages,
    recentMetrics: recentMetrics || [],
    conversationCount: conversationCount || 0,
  }
}

function budgetMessages(messagesNewestFirst: MessageRow[]): MessageRow[] {
  let totalChars = 0
  const budgeted: MessageRow[] = []

  for (const msg of messagesNewestFirst) {
    const msgChars = msg.content.length
    if (totalChars + msgChars > MAX_CHARS) break
    budgeted.push(msg)
    totalChars += msgChars
  }

  // Return in chronological order (oldest first) for conversation flow
  return budgeted.reverse()
}
