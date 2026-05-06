import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { requireEnv } from '../../../../lib/env'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request): Promise<NextResponse> {
  console.log('[api/review/generate] incoming request')

  requireEnv('ANTHROPIC_API_KEY')
  const reviewUrl = requireEnv('VHEALTH_GOOGLE_MAPS_REVIEW_URL')

  let body: { input?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.input === undefined || body.input === null) {
    return NextResponse.json({ error: 'input field is required' }, { status: 400 })
  }

  const patientInput = body.input.trim()
  const prompt = patientInput.length > 0
    ? `A patient at V-Health Rehab Clinic in Calgary says: "${patientInput}".`
    : `A patient recently visited V-Health Rehab Clinic in Calgary.`

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5'),
      prompt: `${prompt}

Write a friendly, authentic 3-sentence Google review on their behalf. The review should:
- Sound like a real patient, not a marketing message
- Mention the clinic by name (V-Health Rehab Clinic)
- Be warm and specific enough to be credible
- End with a recommendation

Output only the review text — no quotes, no introduction, no explanation.`,
    })

    console.log('[api/review/generate] success', { draftChars: text.length })
    return NextResponse.json({ draft: text.trim(), reviewUrl })
  } catch (err) {
    console.error('[api/review/generate] error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
