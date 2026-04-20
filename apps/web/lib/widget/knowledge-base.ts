// apps/web/lib/widget/knowledge-base.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ClinicKB {
  clinic: {
    id: string
    name: string
    domain: string
    janeapp_base_url: string
    hours: string
    address: string
    phone: string
    email: string
    insurance: string
    cancellation: string
    services: string[]
  }
  therapists: Array<{
    id: string
    name: string
    role: string
    bio: string
    janeapp_staff_id: number | null
    specialties: string[]
    languages: string[]
    bookingUrl: string | null
  }>
}

const VHEALTH_STATIC = {
  hours: 'Mon–Fri 9:30 AM – 8:30 PM; Sat–Sun 9:30 AM – 6:00 PM',
  address: '#110 & #216, 5403 Crowchild Trail NW, Calgary, AB T3B 4Z1',
  phone: '403-966-6386',
  email: 'vhealthc@gmail.com',
  insurance: 'Accepts all insurance benefits; direct billing available.',
  cancellation: '24 hours notice required. No-show / late cancel charged at 50% of scheduled visit rate.',
  services: [
    'Deep Tissue Massage', 'Swedish / Relaxation Massage', 'Acupuncture',
    'Manual Osteopathy Therapy', 'Foot Reflexology Therapy',
    'Lymphatic Drainage Massage', 'Cupping Massage Therapy', 'Tui Na Treatment',
  ],
}

export async function loadClinicKB(supabase: SupabaseClient, clinicSlug: string): Promise<ClinicKB | null> {
  const { data: clinic } = await supabase
    .from('clinics')
    .select('id, name, domain, janeapp_base_url')
    .eq('slug', clinicSlug)
    .eq('is_active', true)
    .single()
  if (!clinic) return null

  const { data: therapists } = await supabase
    .from('therapists')
    .select('id, name, role, bio, janeapp_staff_id, specialties, languages')
    .eq('clinic_id', clinic.id)
    .eq('is_active', true)

  return {
    clinic: { ...clinic, ...VHEALTH_STATIC },
    therapists: (therapists ?? []).map(t => ({
      ...t,
      bookingUrl: t.janeapp_staff_id ? `${clinic.janeapp_base_url}/${t.janeapp_staff_id}` : null,
    })),
  }
}
