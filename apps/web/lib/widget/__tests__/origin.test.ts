import { describe, it, expect } from 'vitest'
import { isAllowedOrigin } from '../origin'

describe('isAllowedOrigin', () => {
  const allowed = ['https://vhealth.ca', 'https://www.vhealth.ca', 'http://localhost:3000']

  it('allows exact match', () => {
    expect(isAllowedOrigin('https://vhealth.ca', allowed)).toBe(true)
  })
  it('allows www variant if listed', () => {
    expect(isAllowedOrigin('https://www.vhealth.ca', allowed)).toBe(true)
  })
  it('rejects unlisted domain', () => {
    expect(isAllowedOrigin('https://evil.com', allowed)).toBe(false)
  })
  it('rejects missing origin', () => {
    expect(isAllowedOrigin(null, allowed)).toBe(false)
  })
  it('allows localhost in dev', () => {
    expect(isAllowedOrigin('http://localhost:3000', allowed)).toBe(true)
  })
})
