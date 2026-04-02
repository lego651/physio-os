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

/** Validate a phone string has enough digits for E.164 (10-15 digits) */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15
}

/** Normalize phone number to E.164 format (+1XXXXXXXXXX). Throws on invalid input. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) {
    throw new Error('Invalid phone number: must contain 10-15 digits')
  }
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}
