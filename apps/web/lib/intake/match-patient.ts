import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@physio-os/shared'

type PatientRow = Database['public']['Tables']['patients']['Row']

export interface MatchPatientCandidate {
  id: string
  name: string
  phone_suffix4: string | null
  email_partial: string | null
  last_seen_at: string | null
}

const RankedIdsSchema = z.object({
  ranked_ids: z.array(z.string()),
})

/** Mask phone: last 4 digits only, prefixed with ellipsis. */
function maskPhone(phone: string | null): string | null {
  if (!phone) return null
  return '…' + phone.slice(-4)
}

/** Mask email: first 3 chars + "..." + @domain. */
function maskEmail(email: string | null): string | null {
  if (!email) return null
  const atIdx = email.indexOf('@')
  if (atIdx < 0) return null
  return email.slice(0, 3) + '...' + email.slice(atIdx)
}

/**
 * Match a patient name against the clinic's patient directory.
 *
 * Fast-path rules (no LLM call):
 *   - empty patient list   → []
 *   - single patient       → return directly
 *   - exact name match (case-insensitive, trimmed) → place first, LLM sorts remainder
 *
 * Matching order:
 *   1. Exact case-insensitive match goes first (guaranteed)
 *   2. LLM (Claude Haiku) fuzzy-ranks remaining candidates
 *   3. last_seen_at comes from MAX(date_of_visit) in intake_records
 *   4. Returns at most 10 candidates (PHI minimum exposure)
 */
export async function matchPatient(
  clinicId: string,
  name: string,
  supabase: SupabaseClient<Database>,
): Promise<MatchPatientCandidate[]> {
  // 1. Fetch all patients for this clinic ordered by name
  const { data: patients, error } = await supabase
    .from('patients')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('name')

  if (error || !patients || patients.length === 0) return []

  // 2. Single patient — skip LLM entirely
  if (patients.length === 1) {
    return [await buildCandidate(patients[0]!, supabase)]
  }

  // 3. Exact match (case-insensitive, trimmed) — guaranteed first
  const needle = name.trim().toLowerCase()
  const exactIdx = patients.findIndex((p) => p.name.trim().toLowerCase() === needle)
  const exactMatch = exactIdx >= 0 ? patients[exactIdx]! : null
  const rest = exactMatch ? patients.filter((_, i) => i !== exactIdx) : patients

  // 4. LLM fuzzy-rank the non-exact candidates
  let rankedRest: PatientRow[] = rest
  if (rest.length > 1) {
    rankedRest = await llmRankPatients(name, rest)
  }

  // 5. Build final ordered list: exact first, then LLM-ranked rest
  const ordered = exactMatch ? [exactMatch, ...rankedRest] : rankedRest

  // 6. Fetch last_seen_at and apply masking, cap at 10
  const top10 = ordered.slice(0, 10)
  return Promise.all(top10.map((p) => buildCandidate(p, supabase)))
}

/** Fetch the most recent intake visit date for a patient. */
async function fetchLastSeen(
  patientId: string,
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const { data } = await supabase
    .from('intake_records')
    .select('date_of_visit')
    .eq('patient_id', patientId)
    .order('date_of_visit', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return null
  return data[0]!.date_of_visit
}

/** Build a masked candidate from a raw patient row. */
async function buildCandidate(
  patient: { id: string; name: string; phone: string | null; email: string | null },
  supabase: SupabaseClient<Database>,
): Promise<MatchPatientCandidate> {
  const last_seen_at = await fetchLastSeen(patient.id, supabase)
  return {
    id: patient.id,
    name: patient.name,
    phone_suffix4: maskPhone(patient.phone),
    email_partial: maskEmail(patient.email),
    last_seen_at,
  }
}

/** Use Claude Haiku to fuzzy-rank a list of patients by name similarity. */
async function llmRankPatients(inputName: string, candidates: PatientRow[]): Promise<PatientRow[]> {
  const patientList = candidates
    .map((p) => `  - id: "${p.id}", name: "${p.name}"`)
    .join('\n')

  try {
    const { output } = await generateText({
      model: anthropic('claude-haiku-4-5'),
      output: Output.object({ schema: RankedIdsSchema }),
      prompt: `You are matching a patient name from a voice intake to the closest patients in a directory.

Patients:
${patientList}

Input name: "${inputName}"

Rank all patients by how closely their name matches the input name.
Handle:
- Phonetic variants (e.g. "Ethan" matches "Ethen")
- Partial names (e.g. "Jason" matches "Jason Gao")
- Nicknames and informal name variants

Return ALL patient ids in ranked order (most similar first).`,
    })

    const parsed = RankedIdsSchema.parse(output)
    const candidateMap = new Map(candidates.map((p) => [p.id, p]))
    const ranked = parsed.ranked_ids
      .filter((id) => candidateMap.has(id))
      .map((id) => candidateMap.get(id)!)

    // Append any candidates the LLM omitted at the end
    const ranked_set = new Set(parsed.ranked_ids)
    const omitted = candidates.filter((p) => !ranked_set.has(p.id))

    return [...ranked, ...omitted]
  } catch {
    // LLM failure: return candidates in original order
    return candidates
  }
}
