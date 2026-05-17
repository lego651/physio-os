import { NextResponse } from 'next/server'
import { transcribeAudio, EmptyTranscriptError } from '../../../../lib/intake/whisper'
import { extractIntakeFields, extractSingleField } from '../../../../lib/intake/extract'

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

    // step=1: patient_name — Whisper only, return transcript as-is
    if (step === '1') {
      console.log('[api/intake/upload] step=1 name-only transcription', { chars: transcript.length })
      return NextResponse.json({ transcript })
    }

    // step=2: treatment_area — single-field extract
    if (step === '2') {
      const field = await extractSingleField(transcript, 'treatment_area')
      console.log('[api/intake/upload] step=2 treatment_area extracted')
      return NextResponse.json({ field, transcript })
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
