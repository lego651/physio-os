import { describe, it, expect } from 'vitest'
import { mockPatient, mockMessage, mockMetric } from '../test-utils'

describe('mockPatient', () => {
  it('returns a valid PatientRow with all required fields', () => {
    const patient = mockPatient()
    expect(patient.id).toBeDefined()
    expect(patient.clinic_id).toBe('vhealth')
    expect(patient.phone).toMatch(/^\+1\d{10}$/)
    expect(patient.language).toBe('en')
    expect(patient.sharing_enabled).toBe(false)
    expect(patient.opted_out).toBe(false)
    expect(patient.active).toBe(true)
    expect(patient.created_at).toBeDefined()
    expect(patient.updated_at).toBeDefined()
  })

  it('allows overrides', () => {
    const patient = mockPatient({ name: 'Override Name', language: 'zh' })
    expect(patient.name).toBe('Override Name')
    expect(patient.language).toBe('zh')
  })
})

describe('mockMessage', () => {
  it('returns a valid MessageRow with all required fields', () => {
    const msg = mockMessage()
    expect(msg.id).toBeDefined()
    expect(msg.patient_id).toBeDefined()
    expect(['user', 'assistant', 'system']).toContain(msg.role)
    expect(msg.content).toBeDefined()
    expect(['web', 'sms']).toContain(msg.channel)
    expect(msg.created_at).toBeDefined()
  })

  it('allows overrides', () => {
    const msg = mockMessage({ role: 'assistant', channel: 'sms' })
    expect(msg.role).toBe('assistant')
    expect(msg.channel).toBe('sms')
  })
})

describe('mockMetric', () => {
  it('returns valid pain_level (1-10)', () => {
    const metric = mockMetric()
    expect(metric.pain_level).toBeGreaterThanOrEqual(1)
    expect(metric.pain_level).toBeLessThanOrEqual(10)
  })

  it('returns valid discomfort (0-3)', () => {
    const metric = mockMetric()
    expect(metric.discomfort).toBeGreaterThanOrEqual(0)
    expect(metric.discomfort).toBeLessThanOrEqual(3)
  })

  it('returns valid sitting_tolerance_min (>= 0)', () => {
    const metric = mockMetric()
    expect(metric.sitting_tolerance_min).toBeGreaterThanOrEqual(0)
  })

  it('allows overrides', () => {
    const metric = mockMetric({ pain_level: 9, notes: 'test note' })
    expect(metric.pain_level).toBe(9)
    expect(metric.notes).toBe('test note')
  })
})
