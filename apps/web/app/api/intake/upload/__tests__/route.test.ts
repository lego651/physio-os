import { describe, it, expect, vi, beforeEach } from 'vitest'

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
      patient_name: 'Jane Doe',
      date_of_visit: '2026-05-13',
      therapist_name: 'David',
      treatment_area: 'neck',
      session_notes: 'Dry needling session',
      session_type: 'physio',
    },
    warnings: [],
  }),
  extractSingleField: vi.fn().mockResolvedValue('No notes recorded'),
  extractTreatmentStep: vi.fn().mockResolvedValue({
    treatment_area: 'right knee',
    session_type: 'physio',
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

describe('POST /api/intake/upload — step param', () => {
  it('step=1: returns only transcript, does NOT call extractIntakeFields', async () => {
    const { extractIntakeFields } = await import('../../../../../lib/intake/extract')
    vi.mocked(extractIntakeFields).mockClear()
    const { POST } = await import('../route')
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(100)], { type: 'audio/webm' })
    formData.append('audio', blob, 'recording.webm')
    formData.append('step', '1')
    const req = new Request('http://localhost/api/intake/upload', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transcript).toBe('Patient Jane Doe, neck pain, dry needling')
    expect(body.fields).toBeUndefined()
    expect(extractIntakeFields).not.toHaveBeenCalled()
  })

  it('step=2: calls extractTreatmentStep, returns { transcript, treatment_area, session_type }', async () => {
    const { extractTreatmentStep } = await import('../../../../../lib/intake/extract')
    vi.mocked(extractTreatmentStep).mockClear()
    const { POST } = await import('../route')
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(100)], { type: 'audio/webm' })
    formData.append('audio', blob, 'recording.webm')
    formData.append('step', '2')
    const req = new Request('http://localhost/api/intake/upload', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.treatment_area).toBe('right knee')
    expect(body.session_type).toBe('physio')
    expect(body.field).toBeUndefined()
    expect(body.transcript).toBeDefined()
    expect(extractTreatmentStep).toHaveBeenCalledWith(expect.any(String))
  })
})

// ─── K2 + K3: Hallucination guard — server-side ───────────────────────────────

describe('POST /api/intake/upload — K2: hallucination_detected guard', () => {
  beforeEach(async () => {
    const { transcribeAudio } = await import('../../../../../lib/intake/whisper')
    vi.mocked(transcribeAudio).mockClear()
  })

  it('returns 422 with error=hallucination_detected when Whisper returns "Thank you for watching!"', async () => {
    const { transcribeAudio } = await import('../../../../../lib/intake/whisper')
    vi.mocked(transcribeAudio).mockResolvedValueOnce('Thank you for watching!')
    const { POST } = await import('../route')
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(100)], { type: 'audio/webm' })
    formData.append('audio', blob, 'recording.webm')
    formData.append('step', '1')
    const req = new Request('http://localhost/api/intake/upload', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('hallucination_detected')
  })

  it('applies K2 guard to step=2 as well (all steps protected)', async () => {
    const { transcribeAudio } = await import('../../../../../lib/intake/whisper')
    vi.mocked(transcribeAudio).mockResolvedValueOnce('Thanks for watching')
    const { POST } = await import('../route')
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(100)], { type: 'audio/webm' })
    formData.append('audio', blob, 'recording.webm')
    formData.append('step', '2')
    const req = new Request('http://localhost/api/intake/upload', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('hallucination_detected')
  })

  it('does NOT block legitimate transcript "Cathy Liu" (no false positive)', async () => {
    const { transcribeAudio } = await import('../../../../../lib/intake/whisper')
    vi.mocked(transcribeAudio).mockResolvedValueOnce('Cathy Liu')
    const { POST } = await import('../route')
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(100)], { type: 'audio/webm' })
    formData.append('audio', blob, 'recording.webm')
    formData.append('step', '1')
    const req = new Request('http://localhost/api/intake/upload', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transcript).toBe('Cathy Liu')
  })
})

describe('POST /api/intake/upload — K3: too_short guard', () => {
  beforeEach(async () => {
    const { transcribeAudio } = await import('../../../../../lib/intake/whisper')
    vi.mocked(transcribeAudio).mockClear()
  })

  it('returns 422 with error=too_short when Whisper returns a single period "."', async () => {
    const { transcribeAudio } = await import('../../../../../lib/intake/whisper')
    vi.mocked(transcribeAudio).mockResolvedValueOnce('.')
    const { POST } = await import('../route')
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(100)], { type: 'audio/webm' })
    formData.append('audio', blob, 'recording.webm')
    formData.append('step', '1')
    const req = new Request('http://localhost/api/intake/upload', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('too_short')
  })

  it('returns 422 with error=too_short when Whisper returns a single space', async () => {
    const { transcribeAudio } = await import('../../../../../lib/intake/whisper')
    vi.mocked(transcribeAudio).mockResolvedValueOnce(' ')
    const { POST } = await import('../route')
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(100)], { type: 'audio/webm' })
    formData.append('audio', blob, 'recording.webm')
    formData.append('step', '1')
    const req = new Request('http://localhost/api/intake/upload', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('too_short')
  })

  it('does NOT block "OK" (2 chars — at the acceptance threshold)', async () => {
    const { transcribeAudio } = await import('../../../../../lib/intake/whisper')
    vi.mocked(transcribeAudio).mockResolvedValueOnce('OK')
    const { POST } = await import('../route')
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(100)], { type: 'audio/webm' })
    formData.append('audio', blob, 'recording.webm')
    formData.append('step', '1')
    const req = new Request('http://localhost/api/intake/upload', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })
})
