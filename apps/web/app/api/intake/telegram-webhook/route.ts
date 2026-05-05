import { NextResponse } from 'next/server'
import { transcribeAudio } from '../../../../lib/intake/whisper'
import { extractIntakeFields } from '../../../../lib/intake/extract'
import { saveIntakeRecord } from '../../../../lib/intake/db'
import { requireEnv } from '../../../../lib/env'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request): Promise<NextResponse> {
  console.log('[api/intake/telegram-webhook] incoming request')

  // 1. Verify shared secret
  const secret = request.headers.get('x-webhook-secret')
  const expectedSecret = requireEnv('INTAKE_WEBHOOK_SECRET')
  if (secret !== expectedSecret) {
    console.warn('[api/intake/telegram-webhook] unauthorized — bad secret')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse multipart form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch (err) {
    console.error('[api/intake/telegram-webhook] formData parse error', { error: String(err) })
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const audioFile = formData.get('audio') as File | null
  if (!audioFile) {
    console.warn('[api/intake/telegram-webhook] no audio file in request')
    return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
  }

  const chatId = formData.get('chat_id') as string | null

  try {
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
    const transcript = await transcribeAudio(audioBuffer, audioFile.name || 'voice.ogg')

    const { fields, warnings } = await extractIntakeFields(transcript)

    const record = await saveIntakeRecord({
      ...fields,
      source: 'telegram',
      raw_transcript: transcript,
    })

    console.log('[api/intake/telegram-webhook] success', { recordId: record.id, chatId })
    return NextResponse.json({ success: true, record, warnings })
  } catch (err) {
    // Detect whisper's empty-audio / empty-transcript guards (see lib/intake/whisper.ts)
    // and return 422 so upstream (OpenClaw VPS) stops retrying. Other errors → 500.
    const message = err instanceof Error ? err.message : String(err)
    if (
      message.includes('[whisper] empty transcript') ||
      message.includes('[whisper] empty audio buffer')
    ) {
      console.warn('[api/intake/telegram-webhook] whisper rejected audio', { message })
      return NextResponse.json(
        { error: 'Empty transcript — no speech detected' },
        { status: 422 },
      )
    }
    console.error('[api/intake/telegram-webhook] pipeline error', {
      error: message,
      stack: err instanceof Error ? err.stack : undefined,
    })
    return NextResponse.json({ error: 'Pipeline failed', detail: message }, { status: 500 })
  }
}
