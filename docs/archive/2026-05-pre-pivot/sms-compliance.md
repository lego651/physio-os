# SMS Compliance — CASL (Canadian Anti-Spam Legislation)

This document records the CASL compliance audit performed for S607, covering all outbound SMS paths in the V-Health Recovery Coach application.

---

## CASL Checklist

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | **Consent captured before any outbound SMS** | PASS | `processMessageAsync` in `lib/sms/process.ts` checks `!patient.consent_at` and routes to onboarding before any AI reply is sent. Cron routes (`nudge`, `weekly-report`) query `.not('consent_at', 'is', null)` and `.eq('opted_out', false)` before sending. |
| 2 | **STOP handling ceases all communication** | PASS | `handleKeyword('stop')` sets `opted_out = true` in `patients` table. Webhook handler (`app/api/sms/route.ts`) checks `patient?.opted_out` and returns early. Cron routes filter `opted_out = false`. STOP response is not sent via `sendSMS` (skipped in `processKeyword`). |
| 3 | **START re-subscribes and identifies sender** | PASS (fixed S607) | `handleKeyword('start')` sets `opted_out = false` and now returns `"V-Health Recovery Coach: Welcome back! How are you feeling today? Reply STOP to unsubscribe."` |
| 4 | **HELP provides opt-out instructions** | PASS | `handleKeyword('help')` returns `"V-Health Recovery Coach helps you track your recovery. Reply STOP to unsubscribe. For urgent matters, call V-Health or 911."` |
| 5 | **First outbound message identifies sender** | PASS | Consent message in `lib/sms/onboarding.ts` starts with `"Welcome to V-Health Recovery Coach!"` |
| 6 | **Consent message includes opt-out instructions** | PASS | Consent message includes `"Reply YES to continue or STOP to opt out."` |
| 7 | **Nudge messages include sender ID + opt-out** | PASS (fixed S607) | Footer `"\nV-Health Recovery Coach. Reply STOP to unsubscribe."` appended to every nudge in `app/api/cron/nudge/route.ts`. |
| 8 | **Weekly report SMS includes opt-out instructions** | PASS (fixed S607) | English footer `" Reply STOP to unsubscribe."` and Chinese footer `" 回复STOP退订。"` appended in `app/api/cron/weekly-report/route.ts`. |
| 9 | **Outbound frequency — max 1 nudge per inactive period** | PASS | Nudge cron filters: (a) no user message in last 3 days, (b) `last_nudged_at` < last user message (one nudge per inactive window), (c) never-messaged patients receive at most one nudge after 3-day grace period. |
| 10 | **Outbound frequency — max 1 weekly report** | PASS | Weekly report cron runs on a fixed weekly schedule (Vercel cron). Per-patient send is not gated by a flag because the cron itself is the gate; each patient receives at most one SMS per cron invocation. |
| 11 | **No marketing messages (V1 only recovery-related)** | PASS | AI system prompt enforces recovery-only scope. Safety classifier in `handleMessage` blocks off-topic content. Nudge prompt explicitly says `"Do not include any medical advice"` and is framed as a recovery check-in. |
| 12 | **Message log retained for compliance auditing** | PASS (fixed S607) | All inbound user messages are stored in `messages` table with `twilio_sid` for deduplication. All outbound assistant messages (onboarding, AI replies, nudges, weekly reports) are now persisted to `messages` with `role = 'assistant'`, `channel = 'sms'`. |

---

## Fixes Applied in S607

### 1. `lib/sms/keywords.ts` — START response
Added sender identification and unsubscribe instruction to the START re-subscribe confirmation.

**Before:** `"Welcome back! How are you feeling today?"`  
**After:** `"V-Health Recovery Coach: Welcome back! How are you feeling today? Reply STOP to unsubscribe."`

### 2. `app/api/cron/nudge/route.ts` — Nudge messages
- Appended CASL-required footer (`"\nV-Health Recovery Coach. Reply STOP to unsubscribe."`) to every AI-generated nudge.
- Reduced AI body character budget from 160 to 108 chars to fit within one 160-char SMS segment with the footer.
- Added `messages` table insert after each successful nudge for compliance audit trail.

### 3. `app/api/cron/weekly-report/route.ts` — Weekly report SMS
- Added language-appropriate opt-out footers: English (`" Reply STOP to unsubscribe."`) and Chinese (`" 回复STOP退订。"`).
- Reduced `SMS_SEGMENT_LIMIT_GSM` and `SMS_SEGMENT_LIMIT_UCS2` body budgets to reserve characters for the footers.
- Added `messages` table insert after each successful weekly report SMS for compliance audit trail.

---

## Twilio Advanced Opt-Out Configuration (Manual Step)

Twilio's Advanced Opt-Out feature provides carrier-level enforcement of STOP/START/HELP keywords, independent of application code. This is a defence-in-depth measure required for Canadian short-code and 10DLC compliance.

**Steps to configure (one-time, performed by account owner):**

1. Log in to [Twilio Console](https://console.twilio.com).
2. Navigate to **Messaging** > **Services** (or directly to the phone number if not using a Messaging Service).
3. Select the V-Health phone number or Messaging Service.
4. Click **Compliance** > **Advanced Opt-Out**.
5. Enable **Advanced Opt-Out**.
6. Configure the following custom responses (to match app-level responses for consistency):

| Keyword | Response |
|---------|----------|
| STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT | `You've been unsubscribed from V-Health Recovery Coach. Reply START to re-subscribe.` |
| START | `V-Health Recovery Coach: Welcome back! How are you feeling today? Reply STOP to unsubscribe.` |
| HELP | `V-Health Recovery Coach helps you track your recovery. Reply STOP to unsubscribe. For urgent matters, call V-Health or 911.` |

7. Save changes.

> Note: When Advanced Opt-Out is enabled, Twilio intercepts STOP/START/HELP keywords before delivering them to the webhook. The application-level keyword handling in `lib/sms/keywords.ts` remains as a secondary safeguard and handles the database `opted_out` flag update. You do not need to disable either layer.

---

## Test Plan — STOP / START / STOP Cycle

This test plan verifies the complete opt-out and re-subscribe flow end to end.

### Prerequisites
- A test patient record with `consent_at` set and `opted_out = false`.
- Access to the test phone number and Twilio console logs.

### Test Steps

**T1 — Initial state**
1. Confirm `patients.opted_out = false` for the test patient in Supabase.
2. Send a normal message to the V-Health number from the test phone.
3. Verify an AI reply is received and `messages` table has both user and assistant records.

**T2 — STOP**
1. Reply `STOP` from the test phone.
2. Verify no further SMS is sent (Twilio Advanced Opt-Out intercepts; app also skips `sendSMS` for STOP).
3. Query Supabase: `SELECT opted_out FROM patients WHERE phone = '<test_phone>'` — must be `true`.
4. Send another message from the test phone.
5. Verify no reply is received (webhook returns 200 immediately when `opted_out = true`).

**T3 — Nudge skips opted-out patient**
1. Manually trigger the nudge cron (or wait for scheduled run).
2. Verify the opted-out patient is not in the nudge batch (check `[nudge-cron]` server logs — patient should not appear).

**T4 — START**
1. Reply `START` from the test phone.
2. Verify an SMS is received: `"V-Health Recovery Coach: Welcome back! How are you feeling today? Reply STOP to unsubscribe."`
3. Query Supabase: `opted_out` must be `false`.
4. Send a normal message — verify AI reply is received.

**T5 — STOP again**
1. Reply `STOP` again.
2. Verify `opted_out = true` in Supabase.
3. Verify no further outbound SMS is sent.

**T6 — HELP**
1. While opted in (after T4), reply `HELP`.
2. Verify response: `"V-Health Recovery Coach helps you track your recovery. Reply STOP to unsubscribe. For urgent matters, call V-Health or 911."`

**T7 — Audit log integrity**
1. After completing T1–T6, run:
   ```sql
   SELECT role, content, channel, created_at
   FROM messages
   WHERE patient_id = '<test_patient_id>'
   ORDER BY created_at;
   ```
2. Verify all outbound messages (`role = 'assistant'`) are present with correct content.
3. Verify nudge and weekly-report SMS appear in the log when they are sent.

### Pass Criteria
- All Supabase state transitions match expected values.
- No SMS received after STOP (from either Twilio or app).
- Correct SMS received after START with sender ID and opt-out instructions.
- Complete audit trail in `messages` table for all outbound messages.
