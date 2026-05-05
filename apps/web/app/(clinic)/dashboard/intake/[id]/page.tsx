import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import type { IntakeRecord } from '@physio-os/shared'
import { IntakeDetail } from '../intake-detail'

export const dynamic = 'force-dynamic'

async function getRecord(id: string): Promise<IntakeRecord | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('intake_records')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data as IntakeRecord
}

export default async function IntakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const record = await getRecord(id)
  if (!record) notFound()
  return <IntakeDetail record={record} />
}
