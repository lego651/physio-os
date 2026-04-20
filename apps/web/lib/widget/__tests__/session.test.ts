import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkConversationState, registerOffTopicStrike } from '../session'

// In-memory Supabase-like mock
function mockSupabase(initial: { status?: string; strikes?: number; msgCount?: number } = {}) {
  const state = { status: initial.status ?? 'active', strikes: initial.strikes ?? 0, msgCount: initial.msgCount ?? 0 }
  return {
    state,
    client: {
      from: (table: string) => {
        if (table === 'widget_messages') {
          // Count query chain: .select('*', { count: 'exact', head: true }).eq().neq() -> { count, error }
          const countResult = { count: state.msgCount, error: null }
          const neq = () => Promise.resolve(countResult)
          const eq = () => ({ neq })
          return {
            select: (_cols?: string, _opts?: { count?: string; head?: boolean }) => ({ eq }),
          }
        }
        // widget_conversations
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { status: state.status, offtopic_strikes: state.strikes }, error: null }),
            }),
          }),
          update: (patch: { status?: string; offtopic_strikes?: number }) => ({
            eq: async () => {
              Object.assign(state, {
                status: patch.status ?? state.status,
                strikes: patch.offtopic_strikes ?? state.strikes,
              })
              return { error: null }
            },
          }),
        }
      },
      rpc: async () => ({ data: state.msgCount, error: null }),
    },
  }
}

describe('checkConversationState', () => {
  it('returns locked when status=locked', async () => {
    const { client } = mockSupabase({ status: 'locked' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await checkConversationState(client as any, 'conv-1')
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('locked')
  })
  it('returns ok when active and under cap', async () => {
    const { client } = mockSupabase({ status: 'active', msgCount: 5 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await checkConversationState(client as any, 'conv-1')
    expect(r.blocked).toBe(false)
  })
  it('returns cap_reached when msgCount >= 20', async () => {
    const { client } = mockSupabase({ status: 'active', msgCount: 20 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await checkConversationState(client as any, 'conv-1')
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('cap_reached')
  })
})

describe('registerOffTopicStrike', () => {
  it('locks at 3 strikes', async () => {
    const { client, state } = mockSupabase({ strikes: 2 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await registerOffTopicStrike(client as any, 'conv-1')
    expect(r.newStrikes).toBe(3)
    expect(r.locked).toBe(true)
    expect(state.status).toBe('locked')
  })
  it('does not lock at 1', async () => {
    const { client, state } = mockSupabase({ strikes: 0 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await registerOffTopicStrike(client as any, 'conv-1')
    expect(r.newStrikes).toBe(1)
    expect(r.locked).toBe(false)
    expect(state.status).toBe('active')
  })
})
