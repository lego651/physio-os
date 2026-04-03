import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Test the Zod schemas used by log_metrics and get_history tools
// Schemas replicated here since tools are factory functions

const logMetricsSchema = z.object({
  pain_level: z.number().min(1).max(10).optional(),
  discomfort: z.number().min(0).max(3).optional(),
  sitting_tolerance_min: z.number().min(0).optional(),
  exercises_done: z.array(z.string()).optional(),
  notes: z.string().optional(),
})

const getHistorySchema = z.object({
  days: z.number().min(1).max(30).default(7),
})

describe('log_metrics parameter validation', () => {
  it('accepts valid pain level 1', () => {
    const result = logMetricsSchema.safeParse({ pain_level: 1 })
    expect(result.success).toBe(true)
  })

  it('accepts valid pain level 10', () => {
    const result = logMetricsSchema.safeParse({ pain_level: 10 })
    expect(result.success).toBe(true)
  })

  it('rejects pain level 0', () => {
    const result = logMetricsSchema.safeParse({ pain_level: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects pain level 11', () => {
    const result = logMetricsSchema.safeParse({ pain_level: 11 })
    expect(result.success).toBe(false)
  })

  it('accepts valid discomfort 0', () => {
    const result = logMetricsSchema.safeParse({ discomfort: 0 })
    expect(result.success).toBe(true)
  })

  it('accepts valid discomfort 3', () => {
    const result = logMetricsSchema.safeParse({ discomfort: 3 })
    expect(result.success).toBe(true)
  })

  it('rejects discomfort 4', () => {
    const result = logMetricsSchema.safeParse({ discomfort: 4 })
    expect(result.success).toBe(false)
  })

  it('rejects discomfort -1', () => {
    const result = logMetricsSchema.safeParse({ discomfort: -1 })
    expect(result.success).toBe(false)
  })

  it('accepts sitting tolerance 0', () => {
    const result = logMetricsSchema.safeParse({ sitting_tolerance_min: 0 })
    expect(result.success).toBe(true)
  })

  it('rejects negative sitting tolerance', () => {
    const result = logMetricsSchema.safeParse({ sitting_tolerance_min: -5 })
    expect(result.success).toBe(false)
  })

  it('accepts valid exercises array', () => {
    const result = logMetricsSchema.safeParse({ exercises_done: ['stretches', 'cat-cow'] })
    expect(result.success).toBe(true)
  })

  it('accepts empty exercises array', () => {
    const result = logMetricsSchema.safeParse({ exercises_done: [] })
    expect(result.success).toBe(true)
  })

  it('accepts all fields together', () => {
    const result = logMetricsSchema.safeParse({
      pain_level: 3,
      discomfort: 2,
      sitting_tolerance_min: 30,
      exercises_done: ['stretches'],
      notes: 'Feeling better after morning routine',
    })
    expect(result.success).toBe(true)
  })

  it('accepts no fields (all optional)', () => {
    const result = logMetricsSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})

describe('get_history parameter validation', () => {
  it('defaults days to 7', () => {
    const result = getHistorySchema.parse({})
    expect(result.days).toBe(7)
  })

  it('accepts days = 1', () => {
    const result = getHistorySchema.safeParse({ days: 1 })
    expect(result.success).toBe(true)
  })

  it('accepts days = 30', () => {
    const result = getHistorySchema.safeParse({ days: 30 })
    expect(result.success).toBe(true)
  })

  it('rejects days = 0', () => {
    const result = getHistorySchema.safeParse({ days: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects days = 31', () => {
    const result = getHistorySchema.safeParse({ days: 31 })
    expect(result.success).toBe(false)
  })
})
