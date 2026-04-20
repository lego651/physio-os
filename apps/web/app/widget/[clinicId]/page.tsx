import { createAdminClient } from '@/lib/supabase/admin'
import { loadClinicKB } from '@/lib/widget/knowledge-base'
import { ChatPanel } from './chat-panel'
import { notFound } from 'next/navigation'

export default async function WidgetPage({ params }: { params: Promise<{ clinicId: string }> }) {
  const { clinicId } = await params
  const kb = await loadClinicKB(createAdminClient(), clinicId)
  if (!kb) notFound()
  return <ChatPanel
    clinicSlug={clinicId}
    clinicName={kb.clinic.name}
    phone={kb.clinic.phone}
    turnstileSiteKey={process.env.TURNSTILE_SITE_KEY ?? ''}
  />
}
