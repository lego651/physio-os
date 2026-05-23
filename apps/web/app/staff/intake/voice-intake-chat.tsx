'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Mic, Pencil } from 'lucide-react'
import type { SessionType } from '@physio-os/shared'
import { formatTreatmentBubble } from './treatment-bubble'

// ─── Types ───────────────────────────────────────────────────────────────────

type Step =
  | 'IDLE'
  | 'STEP_1_NAME'
  | 'STEP_2_TREATMENT'
  | 'STEP_3_THERAPIST'
  | 'STEP_4_NOTES'
  | 'CONFIRM'

export interface VoiceIntakeResult {
  patient_name: string
  treatment_area: string
  session_type: SessionType
  therapist_name: string
  session_notes: string
  date_of_visit: string
}

interface Therapist {
  id: string
  name: string
  role: string
}

interface Bubble {
  role: 'ai' | 'user'
  text: string
  stepKey?: keyof VoiceIntakeResult
  editable?: boolean
}

interface Props {
  clinicId?: string
  onComplete?: (result: VoiceIntakeResult) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function pickMimeType(): string {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return 'audio/webm'
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
  return ''
}

function pickExtension(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('mp4') || mimeType.includes('mpeg')) return 'm4a'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}

const STEP_QUESTIONS: Partial<Record<Step, string>> = {
  STEP_1_NAME: "What's the patient's name?",
  STEP_2_TREATMENT: 'What treatment did you do?',
  STEP_3_THERAPIST: 'Which therapist?',
  STEP_4_NOTES: 'Any session notes?',
}

// stepKey → upload stepParam number
const STEPKEY_TO_PARAM: Record<keyof VoiceIntakeResult, string> = {
  patient_name: '1',
  treatment_area: '2',
  session_type: '2', // session_type is extracted in the same upload as treatment_area
  therapist_name: '3',
  session_notes: '4',
  date_of_visit: '1', // fallback, not re-recordable
}

// K1: Minimum recording duration to prevent submitting near-silence to Whisper.
// Below this threshold Whisper reliably hallucinates YouTube outro phrases.
const MIN_RECORDING_MS = 700

// ─── Component ───────────────────────────────────────────────────────────────

export function VoiceIntakeChat({ clinicId = 'vhealth', onComplete }: Props) {
  const [step, setStep] = useState<Step>('IDLE')
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [result, setResult] = useState<Partial<VoiceIntakeResult>>({})
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingStep, setEditingStep] = useState<keyof VoiceIntakeResult | null>(null)
  const [editValue, setEditValue] = useState('')
  const [rerecordingStep, setRerecordingStep] = useState<keyof VoiceIntakeResult | null>(null)

  const router = useRouter()

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const recordingStartRef = useRef<number | null>(null)
  // Ref so that onstop closure can read the current rerecordingStep value.
  const rerecordingStepRef = useRef<keyof VoiceIntakeResult | null>(null)

  // Load therapists on mount
  useEffect(() => {
    fetch(`/api/intake/therapists?clinicId=${encodeURIComponent(clinicId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { therapists: Therapist[] }) => setTherapists(d.therapists ?? []))
      .catch((err: unknown) => console.error('[voice-intake] therapists load failed', err))
  }, [clinicId])

  // Scroll to bottom on new bubble
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [bubbles])

  // Cleanup mic on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const pushBubble = useCallback((bubble: Bubble) => {
    setBubbles((prev) => [...prev, bubble])
  }, [])

  function startSession() {
    setBubbles([])
    setResult({})
    setError(null)
    setStep('STEP_1_NAME')
    setBubbles([{ role: 'ai', text: STEP_QUESTIONS['STEP_1_NAME']! }])
  }

  async function startRecording() {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not supported in this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        const durationMs = recordingStartRef.current !== null
          ? Date.now() - recordingStartRef.current
          : MIN_RECORDING_MS
        recordingStartRef.current = null
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        chunksRef.current = []
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        // K1: reject recordings shorter than MIN_RECORDING_MS — don't waste Whisper quota
        if (durationMs < MIN_RECORDING_MS) {
          setError('Recording too short — please record again.')
          setRerecordingStep(null)
          rerecordingStepRef.current = null
          return
        }
        // Use rerecordingStepRef (not state) because onstop is a closure from startRecording time
        const rerecordTarget = rerecordingStepRef.current
        if (rerecordTarget) {
          await processAudio(blob, { rerecord: rerecordTarget })
        } else {
          await processAudio(blob)
        }
      }
      recorder.start()
      recordingStartRef.current = Date.now()
      recorderRef.current = recorder
      setRecording(true)
    } catch (_err) {
      setError('Could not access microphone. Check permissions.')
      setRerecordingStep(null)
      rerecordingStepRef.current = null
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    setRecording(false)
  }

  function startRerecord(stepKey: keyof VoiceIntakeResult) {
    // Q5: close any open edit mode first
    setEditingStep(null)
    // Mark which step we are re-recording (both state for UI + ref for onstop closure)
    setRerecordingStep(stepKey)
    rerecordingStepRef.current = stepKey
    // Reuse existing recording machinery
    startRecording()
  }

  async function processAudio(blob: Blob, opts?: { rerecord: keyof VoiceIntakeResult }) {
    setProcessing(true)
    setError(null)
    try {
      const ext = pickExtension(blob.type)
      const formData = new FormData()
      formData.append('audio', blob, `recording.${ext}`)

      let stepParam: string
      if (opts?.rerecord) {
        // Rerecord: derive stepParam from the stepKey being re-recorded
        stepParam = STEPKEY_TO_PARAM[opts.rerecord]
      } else {
        // Sequential flow: derive stepParam from current step state
        stepParam =
          step === 'STEP_1_NAME'
            ? '1'
            : step === 'STEP_2_TREATMENT'
              ? '2'
              : step === 'STEP_3_THERAPIST'
                ? '3'
                : '4'
      }
      formData.append('step', stepParam)

      // step=3: also send the therapist list so the route can run the matcher
      if (stepParam === '3') {
        formData.append('therapists', JSON.stringify(therapists))
      }

      const res = await fetch('/api/intake/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null
        // K4: hallucination/too_short errors must NOT push a bubble or advance the step.
        // Show a clear retry message instead.
        if (d?.error === 'hallucination_detected') {
          setError('Audio unclear — please record again.')
          return
        }
        if (d?.error === 'too_short') {
          setError('Audio too short or silent — please record again.')
          return
        }
        if (d?.error === 'non_english_transcript') {
          setError('Please speak in English. Audio was not understood as English.')
          return
        }
        throw new Error(d?.error ?? `Upload failed (${res.status})`)
      }
      const data = (await res.json()) as {
        transcript?: string
        field?: string
        treatment_area?: string
        session_type?: SessionType
        therapist_id?: string
        therapist_name?: string
      }

      if (opts?.rerecord) {
        // ── Rerecord path: replace bubble in-place, do NOT advance step ──────
        const rerecordKey = opts.rerecord
        let newText = ''

        if (rerecordKey === 'patient_name') {
          newText = data.field?.trim() ?? data.transcript?.trim() ?? ''
          setResult((prev) => ({ ...prev, patient_name: newText }))
        } else if (rerecordKey === 'treatment_area') {
          const area = data.treatment_area?.trim() ?? ''
          const sessionType: SessionType = data.session_type ?? 'other'
          const rawTranscript = data.transcript?.trim() ?? ''
          newText = formatTreatmentBubble(area, sessionType, rawTranscript)
          setResult((prev) => ({ ...prev, treatment_area: area, session_type: sessionType }))
        } else if (rerecordKey === 'therapist_name') {
          const matched = therapists.find((t) => t.id === data.therapist_id)
          newText = matched?.name ?? data.therapist_name ?? ''
          setResult((prev) => ({ ...prev, therapist_name: newText }))
        } else if (rerecordKey === 'session_notes') {
          newText = data.field?.trim() ?? ''
          setResult((prev) => ({ ...prev, session_notes: newText }))
        }

        // Replace bubble text in-place (preserve position)
        setBubbles((prev) =>
          prev.map((b) => (b.stepKey === rerecordKey ? { ...b, text: newText } : b)),
        )
        setRerecordingStep(null)
        rerecordingStepRef.current = null
      } else {
        // ── Sequential flow: push bubble + advance ─────────────────────────
        if (step === 'STEP_1_NAME') {
          // Bug L: route now returns cleaned name in `field`, raw Whisper in `transcript`
          const name = data.field?.trim() ?? data.transcript?.trim() ?? ''
          setResult((prev) => ({ ...prev, patient_name: name }))
          pushBubble({ role: 'user', text: name, stepKey: 'patient_name', editable: true })
          advanceStep('STEP_2_TREATMENT')
        } else if (step === 'STEP_2_TREATMENT') {
          const area = data.treatment_area?.trim() ?? ''
          const sessionType: SessionType = data.session_type ?? 'other'
          const rawTranscript = data.transcript?.trim() ?? ''
          setResult((prev) => ({ ...prev, treatment_area: area, session_type: sessionType }))
          const bubbleText = formatTreatmentBubble(area, sessionType, rawTranscript)
          pushBubble({ role: 'user', text: bubbleText, stepKey: 'treatment_area', editable: true })
          advanceStep('STEP_3_THERAPIST')
        } else if (step === 'STEP_3_THERAPIST') {
          const matched = therapists.find((t) => t.id === data.therapist_id)
          const name = matched?.name ?? data.therapist_name ?? ''
          setResult((prev) => ({ ...prev, therapist_name: name }))
          pushBubble({ role: 'user', text: name, stepKey: 'therapist_name', editable: true })
          advanceStep('STEP_4_NOTES')
        } else if (step === 'STEP_4_NOTES') {
          const notes = data.field?.trim() ?? ''
          setResult((prev) => ({ ...prev, session_notes: notes }))
          pushBubble({ role: 'user', text: notes, stepKey: 'session_notes', editable: true })
          advanceStep('CONFIRM')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      if (opts?.rerecord) {
        setRerecordingStep(null)
        rerecordingStepRef.current = null
      }
    } finally {
      setProcessing(false)
    }
  }

  function advanceStep(next: Step) {
    setStep(next)
    if (next === 'CONFIRM') {
      pushBubble({ role: 'ai', text: "Here's what I got. Confirm?" })
    } else if (STEP_QUESTIONS[next]) {
      pushBubble({ role: 'ai', text: STEP_QUESTIONS[next]! })
    }
  }

  function startEdit(stepKey: keyof VoiceIntakeResult) {
    setEditingStep(stepKey)
    setEditValue(result[stepKey] ?? '')
  }

  function saveEdit() {
    if (!editingStep) return
    const val = editValue.trim()
    setResult((prev) => ({ ...prev, [editingStep]: val }))
    setBubbles((prev) => prev.map((b) => (b.stepKey === editingStep ? { ...b, text: val } : b)))
    setEditingStep(null)
  }

  async function confirmIntake() {
    const full: VoiceIntakeResult = {
      patient_name: result.patient_name ?? '',
      treatment_area: result.treatment_area ?? '',
      session_type: result.session_type ?? 'other',
      therapist_name: result.therapist_name ?? '',
      session_notes: result.session_notes ?? '',
      date_of_visit: todayDate(),
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/intake/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...full, source: 'in_app', raw_transcript: null }),
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(d?.error ?? `Save failed (${res.status})`)
      }
      const saveBody = (await res.json()) as { review_request_id: string | null }
      onComplete?.(full)
      const target = saveBody.review_request_id
        ? `/dashboard/review-requests?highlight=${encodeURIComponent(saveBody.review_request_id)}`
        : '/dashboard/review-requests'
      router.push(target)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // Derived: any concurrent operation active (blocks new recordings)
  const busy = recording || processing || !!rerecordingStep

  // ─── Render ────────────────────────────────────────────────────────────────

  if (step === 'IDLE') {
    return (
      <Card className="mb-6">
        <CardContent className="pt-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Step-by-step voice session. Answer one question at a time.
          </p>
          <Button onClick={startSession} className="h-12 w-full">
            Start voice intake
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mb-6">
      <CardContent className="pt-4">
        {/* Chat bubbles */}
        <div className="flex flex-col gap-3 pb-4" style={{ maxHeight: 420, overflowY: 'auto' }}>
          {bubbles.map((b, i) => (
            <div key={i} className={`flex ${b.role === 'ai' ? 'justify-start' : 'justify-end'}`}>
              {b.role === 'ai' ? (
                <div className="max-w-[80%] rounded-2xl rounded-tl-none bg-muted px-4 py-2 text-sm">
                  {b.text}
                </div>
              ) : (
                <div className="flex max-w-[80%] items-center gap-2">
                  {editingStep === b.stepKey ? (
                    <div className="flex items-center gap-1">
                      {b.stepKey === 'therapist_name' ? (
                        <Select
                          value={editValue}
                          onValueChange={(value) => {
                            if (value) {
                              setEditValue(value)
                              setResult((prev) => ({ ...prev, therapist_name: value }))
                              setBubbles((prev) =>
                                prev.map((bub) =>
                                  bub.stepKey === 'therapist_name' ? { ...bub, text: value } : bub,
                                ),
                              )
                              setEditingStep(null)
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select therapist..." />
                          </SelectTrigger>
                          <SelectContent>
                            {therapists.map((t) => (
                              <SelectItem key={t.id} value={t.name}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : b.stepKey === 'session_notes' ? (
                        <>
                          <Textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="min-h-[120px] resize-y text-sm"
                            rows={5}
                            autoFocus
                          />
                          <Button size="sm" onClick={saveEdit} className="h-8 px-2">
                            OK
                          </Button>
                        </>
                      ) : (
                        <>
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                            className="h-8 text-sm"
                            autoFocus
                          />
                          <Button size="sm" onClick={saveEdit} className="h-8 px-2">
                            OK
                          </Button>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Q1/Q2: action icons LEFT of bubble. Order: mic → pencil → bubble */}
                      {b.editable && b.stepKey && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="Re-record this answer"
                            disabled={busy}
                            onClick={() => startRerecord(b.stepKey!)}
                            className={`text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed ${rerecordingStep === b.stepKey ? 'animate-pulse' : ''}`}
                          >
                            <Mic size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label="Edit answer"
                            disabled={!!rerecordingStep}
                            onClick={() => startEdit(b.stepKey!)}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      )}
                      <div className="rounded-2xl rounded-tr-none bg-primary px-4 py-2 text-sm text-primary-foreground">
                        {b.text}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Voice steps: 1, 2, 3, 4 */}
        {(step === 'STEP_1_NAME' || step === 'STEP_2_TREATMENT' || step === 'STEP_3_THERAPIST' || step === 'STEP_4_NOTES') && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Please speak in English for best accuracy.
            </p>
            {!recording ? (
              <Button onClick={startRecording} disabled={processing} className="h-12">
                {processing ? 'Transcribing...' : 'Tap to record'}
              </Button>
            ) : (
              <Button onClick={stopRecording} variant="destructive" className="h-12">
                Stop recording
              </Button>
            )}
          </div>
        )}

        {/* Confirm step */}
        {step === 'CONFIRM' && (
          <div className="mt-2 flex flex-col gap-3">
            <div className="rounded-lg border bg-muted/40 p-4 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="font-medium">Patient</span>
                <span>{result.patient_name}</span>
                <span className="font-medium">Treatment</span>
                <span>{result.treatment_area}</span>
                <span className="font-medium">Therapist</span>
                <span>{result.therapist_name}</span>
                <span className="font-medium">Service</span>
                <span>
                  {result.session_type ?? 'other'}
                  {(result.session_type ?? 'other') === 'other' && (
                    <span className="ml-2 text-xs text-amber-600">
                      Other — verify before sending review
                    </span>
                  )}
                </span>
                <span className="font-medium">Notes</span>
                <span>{result.session_notes}</span>
                <span className="font-medium">Date</span>
                <span>{todayDate()}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={confirmIntake} disabled={saving} className="h-11 flex-1">
                {saving ? 'Saving...' : 'Confirm & save'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const current = result
                  setBubbles([{ role: 'ai', text: STEP_QUESTIONS['STEP_1_NAME']! }])
                  setResult(current)
                  setStep('STEP_1_NAME')
                }}
                className="h-11 flex-1"
              >
                Edit any
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
