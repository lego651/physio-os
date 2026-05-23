import { NextResponse } from 'next/server'
import { transcribeAudio, EmptyTranscriptError } from '../../../../lib/intake/whisper'
import { extractIntakeFields, extractSingleField, extractTreatmentStep } from '../../../../lib/intake/extract'
import { matchTherapist, type TherapistInput } from '../../../../lib/intake/match-therapist'
import { isHallucination, isTooShort } from '../../../../lib/intake/whisper-hallucinations'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request): Promise<NextResponse> {
  console.log('[api/intake/upload] incoming request')

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (err) {
    console.error('[api/intake/upload] formData parse error', { error: String(err) })
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const audioField = formData.get('audio')
  if (!(audioField instanceof File)) {
    console.warn('[api/intake/upload] no audio file in request')
    return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
  }

  const step = formData.get('step')?.toString() ?? null

  try {
    const audioBuffer = Buffer.from(await audioField.arrayBuffer())
    const transcript = await transcribeAudio(audioBuffer, audioField.name || 'recording.webm')

    // K3: reject transcripts that are too short (Whisper returning "." or " " on silence)
    if (isTooShort(transcript)) {
      console.warn('[api/intake/upload] K3 too_short guard fired', { transcript, step })
      return NextResponse.json({ error: 'too_short' }, { status: 422 })
    }

    // K2: reject known Whisper hallucination phrases (YouTube outro etc.)
    if (isHallucination(transcript)) {
      console.warn('[api/intake/upload] K2 hallucination guard fired', { transcript, step })
      return NextResponse.json({ error: 'hallucination_detected' }, { status: 422 })
    }

    // step=1: patient_name — Whisper only, return transcript as-is
    if (step === '1') {
      console.log('[api/intake/upload] step=1 name-only transcription', {
        chars: transcript.length,
      })
      return NextResponse.json({ transcript })
    }

    // step=2: treatment_area + session_type — single Claude call (D18-1)
    if (step === '2') {
      const { treatment_area, session_type } = await extractTreatmentStep(transcript)
      console.log('[api/intake/upload] step=2 extracted', { session_type })
      return NextResponse.json({ transcript, treatment_area, session_type })
    }

    // step=3: therapist match — Whisper + LLM fuzzy match
    // Client sends the therapists JSON array alongside the audio.
    if (step === '3') {
      const therapistsRaw = formData.get('therapists')?.toString() ?? '[]'
      let therapists: TherapistInput[] = []
      try {
        therapists = JSON.parse(therapistsRaw) as TherapistInput[]
      } catch {
        console.warn('[api/intake/upload] step=3 invalid therapists JSON')
      }

      if (therapists.length === 0) {
        console.warn('[api/intake/upload] step=3 no therapists provided')
        return NextResponse.json(
          { error: 'No therapists configured for this clinic' },
          { status: 422 },
        )
      }

      const therapistId = await matchTherapist(transcript, therapists)
      if (therapistId === null) {
        console.warn('[api/intake/upload] step=3 matcher returned null', { transcript })
        return NextResponse.json({ error: 'Could not match therapist from recording' }, { status: 422 })
      }

      const matched = therapists.find((t) => t.id === therapistId)!
      console.log('[api/intake/upload] step=3 matched', { therapistId, name: matched.name })
      return NextResponse.json({ therapist_id: therapistId, therapist_name: matched.name, transcript })
    }

    // step=4: session_notes — single-field extract
    if (step === '4') {
      const field = await extractSingleField(transcript, 'session_notes')
      console.log('[api/intake/upload] step=4 session_notes extracted')
      return NextResponse.json({ field, transcript })
    }

    // no step (legacy IntakeForm path): full 5-field extract
    const { fields, warnings } = await extractIntakeFields(transcript)
    console.log('[api/intake/upload] full extraction success', { warnings })
    return NextResponse.json({ fields, transcript, warnings })
  } catch (err) {
    if (err instanceof EmptyTranscriptError) {
      console.warn('[api/intake/upload] whisper rejected audio', { reason: err.reason })
      return NextResponse.json({ error: 'No speech detected in recording' }, { status: 422 })
    }
    console.error('[api/intake/upload] pipeline error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    return NextResponse.json({ error: 'Pipeline failed' }, { status: 500 })
  }
}
