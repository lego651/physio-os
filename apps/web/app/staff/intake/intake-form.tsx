'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Fields = {
  patient_name: string
  date_of_visit: string
  therapist_name: string
  treatment_area: string
  session_notes: string
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

const EMPTY_FIELDS: Fields = {
  patient_name: '',
  date_of_visit: today(),
  therapist_name: '',
  treatment_area: '',
  session_notes: '',
}

function pickMimeType(): string {
  if (typeof window === 'undefined') return 'audio/webm'
  if (typeof MediaRecorder === 'undefined') return 'audio/webm'
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return 'audio/webm;codecs=opus'
  }
  if (MediaRecorder.isTypeSupported('audio/webm')) {
    return 'audio/webm'
  }
  return ''
}

export function IntakeForm() {
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS)
  const [rawTranscript, setRawTranscript] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // Cleanup on unmount: stop any active stream
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function setField<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  function resetForm() {
    setFields({ ...EMPTY_FIELDS, date_of_visit: today() })
    setRawTranscript(null)
    setWarnings([])
    setError(null)
  }

  async function startRecording() {
    setError(null)
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone access is not supported in this browser.')
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
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || 'audio/webm',
        })
        chunksRef.current = []
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        await uploadRecording(blob)
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
    } catch (err) {
      console.error('[intake-form] getUserMedia failed', err)
      setError('Could not access microphone. Check permissions and try again.')
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    setRecording(false)
  }

  async function uploadRecording(blob: Blob) {
    setUploading(true)
    setError(null)
    setWarnings([])
    try {
      const ext = blob.type.includes('webm') ? 'webm' : 'audio'
      const formData = new FormData()
      formData.append('audio', blob, `recording.${ext}`)
      const res = await fetch('/api/intake/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? `Upload failed (${res.status})`)
      }
      const { fields: extracted, transcript, warnings: extractWarnings } =
        (await res.json()) as {
          fields: Partial<Fields>
          transcript: string
          warnings?: string[]
        }
      setFields((prev) => ({
        patient_name: extracted.patient_name ?? prev.patient_name,
        date_of_visit: extracted.date_of_visit ?? prev.date_of_visit,
        therapist_name: extracted.therapist_name ?? prev.therapist_name,
        treatment_area: extracted.treatment_area ?? prev.treatment_area,
        session_notes: extracted.session_notes ?? prev.session_notes,
      }))
      setRawTranscript(transcript ?? null)
      setWarnings(extractWarnings ?? [])
    } catch (err) {
      console.error('[intake-form] upload failed', err)
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...fields,
        source: rawTranscript ? 'in_app' : 'manual',
        raw_transcript: rawTranscript,
      }
      const res = await fetch('/api/intake/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? `Save failed (${res.status})`)
      }
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        resetForm()
      }, 2000)
    } catch (err) {
      console.error('[intake-form] save failed', err)
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const busy = recording || uploading || saving

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice or manual entry</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-6 flex flex-col gap-2">
          {!recording ? (
            <Button
              type="button"
              onClick={startRecording}
              disabled={uploading || saving}
              className="h-12"
            >
              {uploading ? 'Transcribing…' : 'Start recording'}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={stopRecording}
              variant="destructive"
              className="h-12"
            >
              Stop recording
            </Button>
          )}
          {recording ? (
            <p className="text-sm text-muted-foreground">
              Recording… speak the patient name, date, therapist, treatment area,
              and session notes.
            </p>
          ) : null}
        </div>

        {warnings.length > 0 ? (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
            Low confidence on: {warnings.join(', ')}
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {saved ? (
          <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-200">
            Saved!
          </div>
        ) : null}

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="patient_name">Patient name</Label>
            <Input
              id="patient_name"
              value={fields.patient_name}
              onChange={(e) => setField('patient_name', e.target.value)}
              required
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date_of_visit">Date of visit</Label>
            <Input
              id="date_of_visit"
              type="date"
              value={fields.date_of_visit}
              onChange={(e) => setField('date_of_visit', e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="therapist_name">Therapist</Label>
            <Input
              id="therapist_name"
              value={fields.therapist_name}
              onChange={(e) => setField('therapist_name', e.target.value)}
              required
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="treatment_area">Treatment area</Label>
            <Input
              id="treatment_area"
              value={fields.treatment_area}
              onChange={(e) => setField('treatment_area', e.target.value)}
              required
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session_notes">Session notes</Label>
            <Textarea
              id="session_notes"
              value={fields.session_notes}
              onChange={(e) => setField('session_notes', e.target.value)}
              required
              rows={5}
            />
          </div>

          <Button type="submit" disabled={busy} className="h-12">
            {saving ? 'Saving…' : 'Save session'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
