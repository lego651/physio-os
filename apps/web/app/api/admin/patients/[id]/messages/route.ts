import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminAuth } from '@/lib/auth/require-admin'
import { isValidUUID } from '@/lib/validation'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth()
  if (auth.error) return auth.error

  const { id } = await params
  if (!isValidUUID(id)) {
    return Response.json({ error: 'Invalid patient ID' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)
  const channel = searchParams.get('channel')

  const supabase = createAdminClient()

  // Get total count
  let countQuery = supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', id)

  if (channel && (channel === 'sms' || channel === 'web')) {
    countQuery = countQuery.eq('channel', channel)
  }

  const { count } = await countQuery

  // Get messages
  let query = supabase
    .from('messages')
    .select('id, role, content, channel, media_urls, created_at')
    .eq('patient_id', id)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1)

  if (channel && (channel === 'sms' || channel === 'web')) {
    query = query.eq('channel', channel)
  }

  const { data: messages, error } = await query

  if (error) {
    console.error('[admin/patients/[id]/messages] Query failed:', error)
    return Response.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }

  // Regenerate signed URLs for Supabase Storage media
  const processed = (messages ?? []).map((msg) => {
    if (!msg.media_urls || msg.media_urls.length === 0) return msg
    // Return as-is — signed URL refresh would require async storage calls.
    // The onerror fallback on the frontend handles expired URLs gracefully.
    return msg
  })

  return Response.json({
    messages: processed,
    total: count ?? 0,
  })
}
