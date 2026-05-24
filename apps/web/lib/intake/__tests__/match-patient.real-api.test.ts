/**
 * Real API integration test for matchPatient — calls prod Supabase + Claude Haiku.
 * Run: pnpm vitest run apps/web/lib/intake/__tests__/match-patient.real-api.test.ts
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 * Skipped automatically if env vars are absent (CI-safe).
 */
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@physio-os/shared'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

// Clinic UUID for vhealth (prod)
const CLINIC_ID = '6d8f4102-fc76-4051-b2ef-f00a75d8d7a0'

const canRun = Boolean(SUPABASE_URL && SERVICE_KEY && ANTHROPIC_KEY)

describe.skipIf(!canRun)('matchPatient — real API (prod Supabase + Claude Haiku)', () => {
  // Lazy import so mock at top of unit test file doesn't interfere
  async function getMatchPatient() {
    const { matchPatient } = await import('../match-patient')
    return matchPatient
  }

  function makeSupabase() {
    return createClient<Database>(SUPABASE_URL!, SERVICE_KEY!)
  }

  it('Ethan Liu → returns only Ethan Liu, NOT Jason Gao', async () => {
    const matchPatient = await getMatchPatient()
    const supabase = makeSupabase()

    const results = await matchPatient(CLINIC_ID, 'Ethan Liu', supabase)
    const names = results.map((r) => r.name)

    console.log('[real-api] "Ethan Liu" →', names)

    expect(names).toContain('Ethan Liu')
    expect(names).not.toContain('Jason Gao')
  }, 15000)

  it('Jason Gao → returns only Jason Gao, NOT Ethan Liu', async () => {
    const matchPatient = await getMatchPatient()
    const supabase = makeSupabase()

    const results = await matchPatient(CLINIC_ID, 'Jason Gao', supabase)
    const names = results.map((r) => r.name)

    console.log('[real-api] "Jason Gao" →', names)

    expect(names).toContain('Jason Gao')
    expect(names).not.toContain('Ethan Liu')
  }, 15000)

  it('Mary Smith → returns empty array (no similar patient exists)', async () => {
    const matchPatient = await getMatchPatient()
    const supabase = makeSupabase()

    const results = await matchPatient(CLINIC_ID, 'Mary Smith', supabase)
    const names = results.map((r) => r.name)

    console.log('[real-api] "Mary Smith" →', names)

    expect(results).toEqual([])
  }, 15000)
})
