import { createAdminClient } from '@/lib/supabase/admin'
import type { IntakeRecord } from '@physio-os/shared'
import { IntakeList } from './intake-list'

export const dynamic = 'force-dynamic'

async function getIntakeRecords(): Promise<IntakeRecord[]> {
  console.log('[dashboard/intake] fetching records')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('intake_records')
    .select('*')
    .eq('clinic_id', 'vhealth')
    .order('date_of_visit', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[dashboard/intake] fetch error', { error: error.message })
    throw error
  }
  return (data ?? []) as IntakeRecord[]
}

export default async function IntakePage() {
  const records = await getIntakeRecords()
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Intake Records</h1>
        <a
          href="/staff/intake"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + New Record
        </a>
      </div>
      <IntakeList records={records} />
    </div>
  )
}
