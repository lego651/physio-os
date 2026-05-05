import { describe, it, expect, vi } from 'vitest'

// Mock the helper modules — paths must match the relative imports used by ../route.ts
// (vitest at the repo root has no `@/` alias configured, so relative paths are required)
vi.mock('../../../../../lib/intake/whisper', () => ({
  transcribeAudio: vi.fn().mockResolvedValue('Patient John Smith, lower back, manual therapy'),
}))
vi.mock('../../../../../lib/intake/extract', () => ({
  extractIntakeFields: vi.fn().mockResolvedValue({
    fields: {
      patient_name:   'John Smith',
      date_of_visit:  '2026-05-13',
      therapist_name: 'David',
      treatment_area: 'lower back',
      session_notes:  'Manual therapy session',
    },
    warnings: [],
  }),
}))
vi.mock('../../../../../lib/intake/db', () => ({
  saveIntakeRecord: vi.fn().mockResolvedValue({ id: 'test-uuid', patient_name: 'John Smith' }),
}))

const VALID_SECRET = 'test-secret-123'
vi.stubEnv('INTAKE_WEBHOOK_SECRET', VALID_SECRET)

describe('POST /api/intake/telegram-webhook', () => {
  it('returns 401 when secret header is missing', async () => {
    const { POST } = await import('../route')
    const formData = new FormData()
    formData.append('chat_id', '12345')
    const req = new Request('http://localhost/api/intake/telegram-webhook', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when audio file is missing', async () => {
    const { POST } = await import('../route')
    const formData = new FormData()
    formData.append('chat_id', '12345')
    const req = new Request('http://localhost/api/intake/telegram-webhook', {
      method: 'POST',
      headers: { 'x-webhook-secret': VALID_SECRET },
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 with record when audio and secret are valid', async () => {
    const { POST } = await import('../route')
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(100)], { type: 'audio/ogg' })
    formData.append('audio', blob, 'voice.ogg')
    formData.append('chat_id', '12345')
    const req = new Request('http://localhost/api/intake/telegram-webhook', {
      method: 'POST',
      headers: { 'x-webhook-secret': VALID_SECRET },
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.record.patient_name).toBe('John Smith')
  })
})
