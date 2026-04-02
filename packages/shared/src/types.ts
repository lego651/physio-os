/** Patient profile shape (stored in patients.profile jsonb) */
export interface PatientProfile {
  injury?: string
  diagnosis?: string
  symptoms?: string
  triggers?: string[]
  goals?: string[]
  treatmentPlan?: string
  practitionerName?: string
  practitionerFrequency?: string
}

/** Metric extraction result (from AI tool call) */
export interface MetricExtraction {
  painLevel?: number // 1-10
  discomfort?: number // 0-3
  sittingToleranceMin?: number
  exercisesDone?: string[]
  exerciseCount?: number
  notes?: string
}

/** Channel type */
export type Channel = 'web' | 'sms'

/** Message role */
export type MessageRole = 'user' | 'assistant' | 'system'
