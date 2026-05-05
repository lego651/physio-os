import { describe, it, expect, vi } from 'vitest'

// Mock the helper modules — paths must match the relative imports used by ../route.ts
// (vitest at the repo root has no `@/` alias configured, so relative paths are required)
vi.mock('../../../../../lib/intake/whisper', () => ({
  transcribeAudio: vi.fn().mockResolvedValue('Patient Jane Doe, neck pain, dry needling'),
  // Re-export the real EmptyTranscriptError class so `instanceof` checks in the route still work
  EmptyTranscriptError: class EmptyTranscriptError extends Error {
    readonly reason: 'empty_audio' | 'silent_audio'
    constructor(reason: 'empty_audio' | 'silent_audio') {
      super(`[whisper] ${reason}`)
      this.name = 'EmptyTranscriptError'
      this.reason = reason
    }
  },
}))
vi.mock('../../../../../lib/intake/extract', () => ({
  extractIntakeFields: vi.fn().mockResolvedValue({
    fields: {
      patient_name:   'Jane Doe',
      date_of_visit:  '2026-05-13',
      therapist_name: 'David',
      treatment_area: 'neck',
      session_notes:  'Dry needling session',
    },
    warnings: [],
  }),
}))

describe('POST /api/intake/upload', () => {
  it('returns 400 when audio file is missing', async () => {
    const { POST } = await import('../route')
    const formData = new FormData()
    const req = new Request('http://localhost/api/intake/upload', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 with fields, transcript, and warnings when audio is valid', async () => {
    const { POST } = await import('../route')
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(100)], { type: 'audio/webm' })
    formData.append('audio', blob, 'recording.webm')
    const req = new Request('http://localhost/api/intake/upload', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fields.patient_name).toBe('Jane Doe')
    expect(body.transcript).toBe('Patient Jane Doe, neck pain, dry needling')
    expect(body.warnings).toEqual([])
  })
})
