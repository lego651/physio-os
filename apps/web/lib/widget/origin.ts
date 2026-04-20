export function isAllowedOrigin(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false
  return allowed.includes(origin)
}

export function getAllowedOrigins(clinicDomain: string): string[] {
  const prod = [`https://${clinicDomain}`, `https://www.${clinicDomain}`]
  if (process.env.NODE_ENV !== 'production') {
    prod.push('http://localhost:3000')
  }
  return prod
}
