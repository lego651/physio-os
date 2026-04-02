export const PAIN_SCALE = { min: 1, max: 10, label: 'Pain Level' } as const
export const DISCOMFORT_SCALE = {
  min: 0,
  max: 3,
  labels: ['None', 'Mild', 'Moderate', 'Severe'] as const,
} as const

export function isValidPainLevel(value: number): boolean {
  return Number.isInteger(value) && value >= PAIN_SCALE.min && value <= PAIN_SCALE.max
}

export function isValidDiscomfort(value: number): boolean {
  return Number.isInteger(value) && value >= DISCOMFORT_SCALE.min && value <= DISCOMFORT_SCALE.max
}

export function isValidSittingTolerance(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

/** Normalize phone number to E.164 format (+1XXXXXXXXXX) */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (phone.startsWith('+') && digits.length === 11) return `+${digits}`
  return `+${digits}`
}
