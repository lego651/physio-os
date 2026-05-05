import { NextResponse } from 'next/server'
import { transcribeAudio, EmptyTranscriptError } from '../../../../lib/intake/whisper'
import { extractIntakeFields } from '../../../../lib/intake/extract'

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

  try {
    const audioBuffer = Buffer.from(await audioField.arrayBuffer())
    const transcript = await transcribeAudio(audioBuffer, audioField.name || 'recording.webm')
    const { fields, warnings } = await extractIntakeFields(transcript)
    console.log('[api/intake/upload] success', { warnings })
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
