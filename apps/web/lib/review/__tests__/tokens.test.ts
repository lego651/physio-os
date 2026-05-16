import { describe, it, expect, beforeEach } from 'vitest'
import { mintReviewToken, verifyReviewToken } from '../tokens'

const SECRET = 'a'.repeat(64)

describe('review tokens', () => {
  beforeEach(() => {
    process.env.REVIEW_TOKEN_SECRET = SECRET
    process.env.REVIEW_BASE_URL = 'https://x'
  })

  it('mint then verify returns the original payload', async () => {
    const requestId = '00000000-0000-0000-0000-000000000001'
    const clinicId  = '00000000-0000-0000-0000-000000000002'
    const jti       = '00000000-0000-0000-0000-000000000003'

    const token = await mintReviewToken({ requestId, clinicId, jti, expiresInDays: 14 })
    const decoded = await verifyReviewToken(token)

    expect(decoded).toEqual({ requestId, clinicId, jti })
  })

  it('verify returns null on an expired token', async () => {
    const token = await mintReviewToken({
      requestId: 'r', clinicId: 'c', jti: 'j', expiresInDays: -1,
    })
    const decoded = await verifyReviewToken(token)
    expect(decoded).toBeNull()
  })

  it('verify returns null on a signature mismatch', async () => {
    const token = await mintReviewToken({
      requestId: 'r', clinicId: 'c', jti: 'j', expiresInDays: 14,
    })
    process.env.REVIEW_TOKEN_SECRET = 'b'.repeat(64)
    const decoded = await verifyReviewToken(token)
    expect(decoded).toBeNull()
  })

  it('verify returns null on a malformed token', async () => {
    expect(await verifyReviewToken('not-a-jwt')).toBeNull()
  })
})
