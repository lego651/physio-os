// apps/web/lib/review/prompts.ts

export interface BuildReviewPromptInput {
  clinicName: string
  therapistName: string | null
  serviceType: string
  keywords: string
}

function sanitiseKeywords(raw: string): string {
  return raw.replace(/```/g, "'''").slice(0, 500)
}

export function buildReviewPrompt(input: BuildReviewPromptInput): string {
  const therapistLine = input.therapistName ? `Therapist: ${input.therapistName}\n` : ''
  const safeKeywords = sanitiseKeywords(input.keywords)
  return [
    `You help a patient write a short Google review for ${input.clinicName}.`,
    `The patient's notes (verbatim, between <notes> tags):`,
    `<notes>`,
    safeKeywords,
    `</notes>`,
    therapistLine,
    `Service: ${input.serviceType}`,
    ``,
    `Write a natural, first-person 3-5 sentence Google review.`,
    `- Mention the therapist by name if provided.`,
    `- Mention the service type.`,
    `- Sound like a real patient, not promotional.`,
    `- Do not include any medical claim or diagnosis.`,
    `- Do not include any contact information, URLs, or phone numbers.`,
    `- Do not include hashtags.`,
    `Return only the review text.`,
  ].join('\n')
}
