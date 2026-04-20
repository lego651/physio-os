// apps/web/lib/widget/session.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { WIDGET_CONSTANTS as C } from './constants'

export interface ConversationStateResult {
  blocked: boolean
  reason?: 'locked' | 'cap_reached' | 'not_found'
}

export async function checkConversationState(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<ConversationStateResult> {
  const { data: conv, error } = await supabase
    .from('widget_conversations')
    .select('status, offtopic_strikes')
    .eq('id', conversationId)
    .single()
  if (error || !conv) return { blocked: true, reason: 'not_found' }
  if (conv.status === 'locked') return { blocked: true, reason: 'locked' }

  // Count user+assistant messages
  const { count } = await supabase
    .from('widget_messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .neq('role', 'system')
  if ((count ?? 0) >= C.MAX_MESSAGES_PER_CONVERSATION) return { blocked: true, reason: 'cap_reached' }
  return { blocked: false }
}

export interface StrikeResult { newStrikes: number; locked: boolean }

export async function registerOffTopicStrike(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<StrikeResult> {
  const { data: conv } = await supabase
    .from('widget_conversations')
    .select('offtopic_strikes')
    .eq('id', conversationId)
    .single()
  const current = conv?.offtopic_strikes ?? 0
  const newStrikes = current + 1
  const locked = newStrikes >= C.OFFTOPIC_STRIKE_LIMIT
  await supabase
    .from('widget_conversations')
    .update({ offtopic_strikes: newStrikes, status: locked ? 'locked' : 'active' })
    .eq('id', conversationId)
  return { newStrikes, locked }
}
