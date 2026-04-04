import type { Database } from './database.types'

type PatientRow = Database['public']['Tables']['patients']['Row']
type MessageRow = Database['public']['Tables']['messages']['Row']
type MetricRow = Database['public']['Tables']['metrics']['Row']

export function mockPatient(overrides: Partial<PatientRow> = {}): PatientRow {
  return {
    id: 'a1111111-1111-1111-1111-111111111111',
    clinic_id: 'vhealth',
    phone: '+16041234567',
    name: 'Test Patient',
    language: 'en',
    profile: {},
    daily_routine: {},
    sharing_enabled: false,
    practitioner_name: 'Dr. Test',
    consent_at: new Date().toISOString(),
    opted_out: false,
    active: true,
    auth_user_id: null,
    last_nudged_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

export function mockMessage(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'msg-1111-1111-1111-111111111111',
    patient_id: 'a1111111-1111-1111-1111-111111111111',
    role: 'user',
    content: 'Test message',
    channel: 'web',
    is_emergency: false,
    media_urls: [],
    twilio_sid: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

export function mockMetric(overrides: Partial<MetricRow> = {}): MetricRow {
  return {
    id: 'met-1111-1111-1111-111111111111',
    patient_id: 'a1111111-1111-1111-1111-111111111111',
    recorded_at: new Date().toISOString(),
    pain_level: 4,
    discomfort: 1,
    sitting_tolerance_min: 45,
    exercises_done: ['bird-dog', 'dead-bug'],
    exercise_count: 2,
    notes: null,
    source_message_id: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}
