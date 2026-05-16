// apps/web/lib/review/opt-outs.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type ContactType = 'email' | 'sms'
export type OptOutSource = 'email_link' | 'sms_keyword' | 'admin'

export interface IsOptedOutInput {
  clinicId: string
  contact: string
  contactType: ContactType
}

export interface RecordOptOutInput extends IsOptedOutInput {
  source: OptOutSource
}

export async function isOptedOut(supabase: SupabaseClient, input: IsOptedOutInput): Promise<boolean> {
  const { data } = await supabase
    .from('review_opt_outs')
    .select('id')
    .eq('clinic_id', input.clinicId)
    .eq('contact', input.contact)
    .eq('contact_type', input.contactType)
    .maybeSingle()
  return !!data
}

export async function recordOptOut(supabase: SupabaseClient, input: RecordOptOutInput): Promise<void> {
  await supabase.from('review_opt_outs').upsert({
    clinic_id: input.clinicId,
    contact: input.contact,
    contact_type: input.contactType,
    source: input.source,
  }, { onConflict: 'clinic_id,contact,contact_type' })
}
