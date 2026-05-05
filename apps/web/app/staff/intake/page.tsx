import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IntakeForm } from './intake-form'

export const dynamic = 'force-dynamic'

export default async function StaffIntakePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/dashboard/login?next=/staff/intake')
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-8">
      <div className="mx-auto max-w-lg">
        <h1 className="mb-6 text-2xl font-semibold">New Session Record</h1>
        <IntakeForm />
      </div>
    </main>
  )
}
