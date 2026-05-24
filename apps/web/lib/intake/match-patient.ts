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

const FilteredMatchesSchema = z.object({
  matches: z.array(
    z.object({
      patient_id: z.string(),
      reason: z.string(),
    }),
  ),
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

  // 4. LLM filter + rank the non-exact candidates (returns only similar ones)
  let filteredRest: PatientRow[] = rest
  if (rest.length >= 1) {
    filteredRest = await llmFilterAndRankPatients(name, rest)
  }

  // 5. Build final ordered list: exact first, then LLM-filtered rest
  const ordered = exactMatch ? [exactMatch, ...filteredRest] : filteredRest

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

/**
 * Use Claude Haiku to filter AND rank a list of patients by name similarity.
 *
 * Unlike the old ranker, this function returns ONLY patients whose names are
 * phonetically or orthographically similar to the input. Completely dissimilar
 * patients (different first name, different ethnicity, no acoustic overlap) are
 * excluded from the result entirely.
 *
 * Few-shot examples baked into the prompt (real prod cases):
 *   "Ethan Liu"  + [Ethan Liu, Jason Gao, Eason Liu, Mary Smith] → [Ethan Liu, Eason Liu]
 *   "Ethaniel"   + [Ethan Liu, Jason Gao]                        → [Ethan Liu]
 *   "Ethan Niu"  + [Ethan Liu, Mark Wong]                        → [Ethan Liu]  (Niu ≈ Liu phonetically)
 *   "John Smith" + [Mary Jones, Bob Wilson]                      → []
 */
async function llmFilterAndRankPatients(
  inputName: string,
  candidates: PatientRow[],
): Promise<PatientRow[]> {
  const patientList = candidates
    .map((p) => `  - patient_id: "${p.id}", name: "${p.name}"`)
    .join('\n')

  try {
    const { output } = await generateText({
      model: anthropic('claude-haiku-4-5'),
      output: Output.object({ schema: FilteredMatchesSchema }),
      prompt: `You are a patient name matcher for a physiotherapy clinic voice intake system.

Your job: given a spoken/transcribed patient name and a list of patients in the directory,
return ONLY the patients whose names could plausibly be the same person as the input.

Rules:
- Return ONLY patients whose names sound phonetically similar OR are spelling/transcription variants of the input name.
- DO NOT return patients with clearly different names (e.g. different first name with no acoustic overlap, different ethnic origin with no overlap).
- If no patient is similar, return an empty matches array.
- For each match, provide a brief reason (e.g. "phonetic variant", "exact match", "partial name").

Few-shot examples:

Input: "Ethan Liu"
Candidates: [Ethan Liu, Jason Gao, Eason Liu, Mary Smith]
→ matches: [{ patient_id: "<ethan-id>", reason: "exact name match" }, { patient_id: "<eason-id>", reason: "Eason is phonetic variant of Ethan; Liu matches Liu" }]

Input: "Ethaniel"
Candidates: [Ethan Liu, Jason Gao]
→ matches: [{ patient_id: "<ethan-id>", reason: "Ethaniel is a variant of Ethan" }]

Input: "Ethan Niu"
Candidates: [Ethan Liu, Mark Wong]
→ matches: [{ patient_id: "<ethan-id>", reason: "Niu is a common transcription error for Liu (phonetically similar in English)" }]

Input: "John Smith"
Candidates: [Mary Jones, Bob Wilson]
→ matches: []

Now match this input:

Input name: "${inputName}"
Candidates:
${patientList}`,
    })

    const parsed = FilteredMatchesSchema.parse(output)
    const candidateMap = new Map(candidates.map((p) => [p.id, p]))

    return parsed.matches
      .filter((m) => candidateMap.has(m.patient_id))
      .map((m) => candidateMap.get(m.patient_id)!)
  } catch {
    // LLM failure: return candidates in original order (safe fallback)
    return candidates
  }
}
