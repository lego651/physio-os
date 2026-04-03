import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Validate Twilio request signature per https://www.twilio.com/docs/usage/security#validating-requests
 * Uses HMAC-SHA1 of (url + sorted params) compared against X-Twilio-Signature header.
 */
export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  // Build the data string: URL + sorted param key-value pairs
  const sortedKeys = Object.keys(params).sort()
  let data = url
  for (const key of sortedKeys) {
    data += key + params[key]
  }

  const expected = createHmac('sha1', authToken).update(data, 'utf-8').digest('base64')

  // Constant-time comparison using Node.js standard library
  const expectedBuf = Buffer.from(expected, 'utf-8')
  const signatureBuf = Buffer.from(signature, 'utf-8')
  if (expectedBuf.length !== signatureBuf.length) return false
  return timingSafeEqual(expectedBuf, signatureBuf)
}
