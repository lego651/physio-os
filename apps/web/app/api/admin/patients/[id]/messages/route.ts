import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = request.nextUrl
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    messages: messages ?? [],
    total: count ?? 0,
  })
}
