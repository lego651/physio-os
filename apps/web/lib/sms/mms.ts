import { createClient } from '@supabase/supabase-js'
import type { Database } from '@physio-os/shared'

const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB

interface MediaResult {
  storagePath: string
  publicUrl: string
  contentType: string
}

/**
 * Download MMS media from Twilio, validate, and upload to Supabase Storage.
 * Returns storage URLs for valid images; silently skips non-image media.
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
  const results: MediaResult[] = []
  const dateStr = new Date().toISOString().split('T')[0]

  for (let i = 0; i < numMedia; i++) {
    const mediaUrl = params[`MediaUrl${i}`]
    const contentType = params[`MediaContentType${i}`]

    if (!mediaUrl) continue

    // Only accept image types
    if (!contentType || !ACCEPTED_IMAGE_TYPES.has(contentType)) {
      continue
    }

    try {
      // Download from Twilio (authenticated — Twilio URLs require credentials)
      const response = await fetch(mediaUrl, {
        headers: { Authorization: `Basic ${twilioAuth}` },
      })

      if (!response.ok) {
        console.error(`[mms] Failed to download media ${i}:`, response.status)
        continue
      }

      const blob = await response.blob()

      // Reject oversized images
      if (blob.size > MAX_IMAGE_SIZE) {
        console.warn(`[mms] Image ${i} too large (${blob.size} bytes), skipping`)
        continue
      }

      // Determine file extension
      const ext = contentType.split('/')[1] || 'jpg'
      const filename = `media_${i}_${Date.now()}.${ext}`
      const storagePath = `${patientId}/${dateStr}/${filename}`

      // Upload to Supabase Storage
      const buffer = Buffer.from(await blob.arrayBuffer())
      const { error: uploadError } = await supabase.storage
        .from('patient-media')
        .upload(storagePath, buffer, {
          contentType,
          upsert: false,
        })

      if (uploadError) {
        console.error(`[mms] Failed to upload media ${i}:`, uploadError.message)
        continue
      }

      // Get signed URL (24-hour expiry for dashboard viewing)
      const { data: signedData } = await supabase.storage
        .from('patient-media')
        .createSignedUrl(storagePath, 24 * 60 * 60) // 24 hours

      const publicUrl = signedData?.signedUrl || ''

      results.push({ storagePath, publicUrl, contentType })
    } catch (err) {
      console.error(`[mms] Error processing media ${i}:`, err)
    }
  }

  return results
}

/**
 * Create a Supabase storage bucket for patient media if it doesn't exist.
 * Call this during app initialization or migration.
 */
export async function ensureMediaBucket(
  supabase: ReturnType<typeof createClient<Database>>,
): Promise<void> {
  const { error } = await supabase.storage.createBucket('patient-media', {
    public: false,
    fileSizeLimit: MAX_IMAGE_SIZE,
    allowedMimeTypes: Array.from(ACCEPTED_IMAGE_TYPES),
  })

  // Ignore "already exists" error
  if (error && !error.message.includes('already exists')) {
    console.error('[mms] Failed to create storage bucket:', error.message)
  }
}
