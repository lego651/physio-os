import { createClient } from '@supabase/supabase-js'
import type { Database } from '@physio-os/shared'

const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB

export interface MediaResult {
  storagePath: string
  contentType: string
}

/**
 * Download MMS media from Twilio, validate, and upload to Supabase Storage.
 * Downloads run in parallel via Promise.allSettled so a slow/failed download
 * doesn't block other media items.
 * Returns storage paths for valid images; silently skips non-image media.
 */
export async function processMMSMedia(
  params: Record<string, string>,
  numMedia: number,
  patientId: string,
  supabase: ReturnType<typeof createClient<Database>>,
): Promise<MediaResult[]> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) return []

  const twilioAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const dateStr = new Date().toISOString().split('T')[0]

  // Build download tasks for valid media items
  const tasks: Array<Promise<MediaResult | null>> = []

  for (let i = 0; i < numMedia; i++) {
    const mediaUrl = params[`MediaUrl${i}`]
    const contentType = params[`MediaContentType${i}`]

    if (!mediaUrl || !contentType || !ACCEPTED_IMAGE_TYPES.has(contentType)) continue

    tasks.push(processOneMedia(i, mediaUrl, contentType, patientId, dateStr, twilioAuth, supabase))
  }

  if (tasks.length === 0) return []

  // Run all downloads in parallel — failures don't block other items
  const settled = await Promise.allSettled(tasks)
  const results: MediaResult[] = []
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled' && outcome.value) {
      results.push(outcome.value)
    } else if (outcome.status === 'rejected') {
      console.error('[mms] Media processing failed:', outcome.reason)
    }
  }
  return results
}

async function processOneMedia(
  index: number,
  mediaUrl: string,
  contentType: string,
  patientId: string,
  dateStr: string,
  twilioAuth: string,
  supabase: ReturnType<typeof createClient<Database>>,
): Promise<MediaResult | null> {
  // Download from Twilio (authenticated — Twilio URLs require credentials)
  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${twilioAuth}` },
    signal: AbortSignal.timeout(8000), // Abort before the function timeout
  })

  if (!response.ok) {
    console.error(`[mms] Failed to download media ${index}:`, response.status)
    return null
  }

  const blob = await response.blob()

  if (blob.size > MAX_IMAGE_SIZE) {
    console.warn(`[mms] Image ${index} too large (${blob.size} bytes), skipping`)
    return null
  }

  const ext = contentType.split('/')[1] || 'jpg'
  const filename = `media_${index}_${Date.now()}.${ext}`
  const storagePath = `${patientId}/${dateStr}/${filename}`

  const buffer = Buffer.from(await blob.arrayBuffer())
  const { error: uploadError } = await supabase.storage
    .from('patient-media')
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    })

  if (uploadError) {
    console.error(`[mms] Failed to upload media ${index}:`, uploadError.message)
    return null
  }

  // Store the storagePath as primary reference — signed URLs are generated on demand
  return { storagePath, contentType }
}
