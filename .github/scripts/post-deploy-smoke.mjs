#!/usr/bin/env node
// .github/scripts/post-deploy-smoke.mjs
//
// Post-deploy smoke test: verifies SMS and Email delivery after a Vercel
// production deploy. Runs as a standalone Node.js ESM script — no build step.
//
// Usage:
//   TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... TWILIO_PHONE_NUMBER=+1... \
//   SMOKE_TEST_RECIPIENT_PHONE=+1... RESEND_API_KEY=re_... ALERT_EMAIL=... \
//   node .github/scripts/post-deploy-smoke.mjs
//
// Exit codes:
//   0 — all checks passed
//   1 — one or more checks failed (alert email sent)

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  SMOKE_TEST_RECIPIENT_PHONE,
  RESEND_API_KEY,
  ALERT_EMAIL = 'jasonusca@gmail.com',
  DEPLOY_URL = 'https://physio-os-web.vercel.app',
} = process.env

// Validate required env vars before doing anything
const missing = []
if (!TWILIO_ACCOUNT_SID)       missing.push('TWILIO_ACCOUNT_SID')
if (!TWILIO_AUTH_TOKEN)        missing.push('TWILIO_AUTH_TOKEN')
if (!TWILIO_PHONE_NUMBER)      missing.push('TWILIO_PHONE_NUMBER')
if (!SMOKE_TEST_RECIPIENT_PHONE) missing.push('SMOKE_TEST_RECIPIENT_PHONE')
if (!RESEND_API_KEY)           missing.push('RESEND_API_KEY')
if (missing.length > 0) {
  console.error('[smoke-test] Missing required env vars:', missing.join(', '))
  process.exit(1)
}

const TWILIO_API_BASE = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}`
const RESEND_API_URL  = 'https://api.resend.com/emails'

function basicAuth() {
  return 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── SMS smoke test ───────────────────────────────────────────────────────────

async function sendTwilioSms(body) {
  const form = new URLSearchParams()
  form.set('To',   SMOKE_TEST_RECIPIENT_PHONE)
  form.set('From', TWILIO_PHONE_NUMBER)
  form.set('Body', body)

  const res = await fetch(`${TWILIO_API_BASE}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Twilio send failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  return data.sid
}

async function getTwilioMessageStatus(sid) {
  const res = await fetch(`${TWILIO_API_BASE}/Messages/${sid}.json`, {
    headers: { Authorization: basicAuth() },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Twilio status check failed: ${res.status} ${text}`)
  }
  const data = await res.json()
  return data.status
}

async function smokeSms() {
  const timestamp = new Date().toISOString()
  const body = `[smoke-test] V-Health deploy verification at ${timestamp}`
  console.log('[smoke-test:sms] Sending SMS...')

  let sid
  try {
    sid = await sendTwilioSms(body)
    console.log(`[smoke-test:sms] Sent SID=${sid}, polling for delivery...`)
  } catch (err) {
    return { ok: false, sid: null, status: 'send_error', error: String(err) }
  }

  // Poll every 3s for up to 30s (10 attempts)
  for (let i = 0; i < 10; i++) {
    await sleep(3000)
    try {
      const status = await getTwilioMessageStatus(sid)
      console.log(`[smoke-test:sms] Poll ${i + 1}/10: status=${status}`)
      if (status === 'delivered') {
        return { ok: true, sid, status }
      }
      if (status === 'failed' || status === 'undelivered') {
        return { ok: false, sid, status }
      }
      // queued / sending / sent — keep polling
    } catch (err) {
      return { ok: false, sid, status: 'poll_error', error: String(err) }
    }
  }

  return { ok: false, sid, status: 'timeout' }
}

// ─── Email smoke test ─────────────────────────────────────────────────────────

async function smokeEmail() {
  const timestamp = new Date().toISOString()
  console.log('[smoke-test:email] Sending test email via Resend...')

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'smoke-test@onboarding.resend.dev',
      to:   ALERT_EMAIL,
      subject: `[smoke-test] V-Health Rehab deploy verification ${timestamp}`,
      text: [
        `Post-deploy smoke test — Email path.`,
        `Deploy: ${DEPLOY_URL}`,
        `Timestamp: ${timestamp}`,
        ``,
        `This email confirms that the Resend API is reachable and accepting requests.`,
      ].join('\n'),
    }),
  })

  if (res.ok) {
    const data = await res.json()
    console.log(`[smoke-test:email] Accepted by Resend. id=${data.id}`)
    return { ok: true, id: data.id }
  }

  const errText = await res.text()
  console.error(`[smoke-test:email] Resend returned ${res.status}: ${errText}`)
  return { ok: false, error: `${res.status} ${errText}` }
}

// ─── Alert on failure ─────────────────────────────────────────────────────────

async function sendAlertEmail(subject, message) {
  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'smoke-test@onboarding.resend.dev',
        to:   ALERT_EMAIL,
        subject,
        text: message,
      }),
    })
    if (res.ok) {
      console.log(`[smoke-test:alert] Alert email sent to ${ALERT_EMAIL}`)
    } else {
      const text = await res.text()
      console.error(`[smoke-test:alert] Failed to send alert email: ${res.status} ${text}`)
    }
  } catch (err) {
    console.error(`[smoke-test:alert] Exception sending alert email:`, err)
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[smoke-test] Starting post-deploy smoke test. Deploy: ${DEPLOY_URL}`)
  let exitCode = 0

  // SMS path
  const smsResult = await smokeSms()
  if (smsResult.ok) {
    console.log('[smoke-test:sms] PASSED', smsResult)
  } else {
    exitCode = 1
    console.error('[smoke-test:sms] FAILED', smsResult)
    await sendAlertEmail(
      '🚨 SMS smoke test FAILED post-deploy',
      [
        `SMS smoke test FAILED after deploy.`,
        ``,
        `Deploy URL:  ${DEPLOY_URL}`,
        `SID:         ${smsResult.sid ?? 'N/A'}`,
        `Status:      ${smsResult.status}`,
        `Error:       ${smsResult.error ?? 'N/A'}`,
        `Timestamp:   ${new Date().toISOString()}`,
        ``,
        `Action required: check Twilio console and Vercel env vars.`,
      ].join('\n'),
    )
  }

  // Email path
  const emailResult = await smokeEmail()
  if (emailResult.ok) {
    console.log('[smoke-test:email] PASSED', emailResult)
  } else {
    exitCode = 1
    console.error('[smoke-test:email] FAILED', emailResult)
    await sendAlertEmail(
      '🚨 Email smoke test FAILED post-deploy',
      [
        `Email smoke test FAILED after deploy.`,
        ``,
        `Deploy URL:  ${DEPLOY_URL}`,
        `Error:       ${emailResult.error ?? 'N/A'}`,
        `Timestamp:   ${new Date().toISOString()}`,
        ``,
        `Action required: check Resend API key and Vercel env vars.`,
      ].join('\n'),
    )
  }

  if (exitCode === 0) {
    console.log('[smoke-test] All checks PASSED.')
  } else {
    console.error('[smoke-test] One or more checks FAILED. See alert emails.')
  }

  process.exit(exitCode)
}

main().catch((err) => {
  console.error('[smoke-test] Unhandled error:', err)
  process.exit(1)
})
