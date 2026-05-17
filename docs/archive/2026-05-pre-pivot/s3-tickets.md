# Sprint 3 — Engineering Tickets

> Sprint goal: Full SMS conversation loop. Metric extraction and storage. MMS image handling. Unified history across web and SMS.
> Deliverable: Patient texts Twilio number → gets AI reply. Pain/discomfort/exercises extracted and stored in metrics table. Web and SMS share conversation history.
> Total: 32 points across 11 tickets.

---

### S301 — Twilio account setup and local dev configuration
**Type:** setup
**Points:** 2
**Depends on:** none

**Goal:** Twilio account ready with a Canadian phone number and local development webhook via ngrok.

**Scope:**
- Create Twilio account (or use existing)
- Purchase Canadian phone number with SMS + MMS capability
- Configure webhook URL for inbound SMS: `POST https://{ngrok-url}/api/sms` (local dev)
- Install ngrok; document startup: `ngrok http 3000`
- Add env vars to `.env.local`:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER` (E.164 format)
- Add env vars to Vercel (for production, added in S6)
- Document setup steps in `docs/twilio-setup.md` for future reference
- Test: send SMS to the Twilio number → see POST request in ngrok inspector

**Acceptance criteria:**
1. Canadian phone number purchased and active
2. Sending SMS to the number triggers a POST to the ngrok URL
3. ngrok inspector shows the Twilio webhook payload
4. All env vars documented in `.env.example`
5. Setup documented in `docs/twilio-setup.md`

**Out of scope:**
- Processing the webhook (S302)
- Production Twilio config (S6)

---

### S302 — `/api/sms` webhook: receive, validate, identify patient
**Type:** backend
**Points:** 5
**Depends on:** S301, S201, S203

**Goal:** API route that receives Twilio webhooks, validates them, identifies the patient, and processes asynchronously.

**Scope:**
- Create `apps/web/app/api/sms/route.ts`:
  - POST handler receives Twilio webhook (form-urlencoded)
  - **Step 1: Validate** — verify Twilio request signature using `TWILIO_AUTH_TOKEN` + request URL + body params. Reject invalid with 403.
  - **Step 2: Idempotency** — check `messages` table for existing `twilio_sid = MessageSid`. If exists, return 200 (already processed).
  - **Step 3: Parse** — extract: `Body` (message text), `From` (phone), `MessageSid`, `NumMedia`, `MediaUrl0..N`, `MediaContentType0..N`
  - **Step 4: Identify patient** — lookup `patients` table by phone number (E.164 normalized)
  - **Step 5: Check status** — if `opted_out = true`: return 200 silently. If no patient found: trigger SMS onboarding (S304).
  - **Step 5b: Rate limit** — reject (return 200, no processing) if same phone number sends > 10 messages in 1 hour. Use simple in-memory counter or Redis.
  - **Step 6: Return 200 immediately** — Twilio requires response within 15s. Do not wait for AI.
  - **Step 7: Process async** — use `waitUntil()` (Vercel) or similar to process in background:
    - Run safety classifier (S207)
    - Build context (S203)
    - Call AI engine (S201) with channel = 'sms'
    - Send reply via Twilio REST API (S303)
- Phone normalization utility: strip spaces, add +1 for Canadian numbers, validate E.164

**Edge cases:**
- Twilio sends duplicate webhooks → idempotency on `MessageSid` prevents double processing
- Invalid Twilio signature → 403, no processing
- Patient sends SMS before web onboarding → patient record may exist without `auth_user_id` (that's fine)
- Phone number with/without country code → normalize to E.164
- Empty message body (MMS-only) → process media, body = ""
- Twilio sends `NumMedia: 0` when no attachments

**Acceptance criteria:**
1. Valid Twilio webhook → 200 response within 2 seconds
2. Invalid signature → 403
3. Duplicate `MessageSid` → 200 with no reprocessing
4. Known patient → message saved and AI reply sent
5. Unknown phone → onboarding triggered
6. Opted-out patient → 200 with no reply
7. Phone numbers normalized to E.164 before lookup
8. User message saved to `messages` with `channel = 'sms'` and `twilio_sid`
9. Rate limit: 11th message from same phone in 1 hour → 200 returned, no processing

**Out of scope:**
- Sending the actual reply (S303)
- MMS processing (S305)
- STOP/START handling (S309)

---

### S303 — Async SMS reply via Twilio REST API
**Type:** backend
**Points:** 5
**Depends on:** S302, S201

**Goal:** After AI processes the message, send the reply back to the patient via Twilio.

**Scope:**
- Create `apps/web/lib/sms/send.ts`:
  - `sendSMS(to: string, body: string, mediaUrls?: string[])` function
  - Uses Twilio REST API (not TwiML response) — because webhook already returned 200
  - Install `twilio` package in `apps/web`
- SMS response flow (inside the async processing from S302):
  1. AI engine returns complete response (non-streaming for SMS)
  2. Format response: if > 280 chars, truncate at last sentence boundary + append "\n\nMore: {app_url}/chat"
  3. Send via `sendSMS()`
  4. Save assistant message to `messages` table with `channel = 'sms'`
- Non-streaming mode for SMS: use `generateText()` instead of `streamText()` from Vercel AI SDK
- Error handling: if Twilio send fails, retry once after 2s. If still fails, log error (Sentry in S5).

**Edge cases:**
- Response exactly 160 chars → send as single segment (no truncation)
- Response 161-320 chars → send as-is (2 segments, within budget)
- Response > 320 chars → truncate + web link
- Truncation should not cut mid-word or mid-sentence
- Unicode/Chinese characters: SMS encoding uses UCS-2 for non-GSM chars, reducing segment to 70 chars. Chinese responses should be even shorter. System prompt must enforce ~140 chars for Chinese responses.
- Twilio API failure → patient gets no reply. Must log this clearly for debugging.

**Acceptance criteria:**
1. AI response under 280 chars → sent as-is via Twilio
2. AI response over 320 chars → truncated + web link appended
3. Truncation does not cut mid-word
4. Assistant message saved to DB with `channel = 'sms'`
5. Twilio send failure → retried once → error logged
6. Chinese response length correctly accounts for UCS-2 encoding
7. End-to-end: patient sends SMS → receives reply within 15 seconds (typical)

**Out of scope:**
- Sending MMS responses (not needed for V1 — only receiving MMS)
- Batch messaging
- Scheduled messages (S4 — cron)

---

### S304 — SMS onboarding for unknown phone numbers
**Type:** fullstack
**Points:** 5
**Depends on:** S302, S303

**Goal:** When an unknown phone number texts in, guide them through a minimal onboarding via SMS.

**Scope:**
- Detect unknown phone in S302 → trigger onboarding flow
- SMS onboarding is a stateful multi-step conversation:
  1. **Consent:** "Welcome to V-Health Recovery Coach! By continuing, you agree to our privacy policy: {url}/privacy. Reply YES to continue or STOP to opt out."
  2. Patient replies YES → record `consent_at`, continue
  3. **Name:** "Great! What should we call you?"
  4. Patient replies with name → save to `patients.name`
  5. **Condition:** "What brings you to V-Health? (e.g., back pain, shoulder injury)"
  6. Patient replies → save to `patients.profile.injury`
  7. **Language:** "Preferred language? Reply 1 for English, 2 for 中文"
  8. Patient replies → save to `patients.language`
  9. **Complete:** "You're all set, {name}! How are you feeling right now? Rate your discomfort 0-3 (0=none, 1=mild, 2=moderate, 3=severe)."
- Track onboarding state using field presence: onboarding is "complete" when `consent_at IS NOT NULL AND name IS NOT NULL AND profile->>'injury' IS NOT NULL AND language IS NOT NULL`. No separate `onboarding_step` field — check which fields are missing and ask for the next one. This is the same logic web onboarding (S206) uses.
- Create patient record on first message (with phone + `clinic_id = 'vhealth'`)
- If patient replies with something unexpected → repeat the current step question

**Edge cases:**
- Patient replies NO or anything other than YES to consent → "No problem. Reply YES when you're ready to start."
- Patient replies STOP → mark `opted_out = true`, cease communication
- Patient abandons mid-onboarding → state preserved, resume on next message
- Patient already has a record (e.g., admin added them in S5) → skip to incomplete steps
- Very long name or condition text → accept and truncate at 200 chars

**Acceptance criteria:**
1. Unknown phone number → consent message sent
2. YES → name question sent; consent_at recorded
3. Name provided → condition question sent; name saved
4. Condition provided → language question sent; condition saved
5. Language chosen → welcome message with first metric ask
6. STOP at any point → opted_out = true, no more messages
7. Unexpected reply → current step repeated
8. Resumable: abandon + text later → continues from last step
9. Existing patient with partial profile → fills gaps only

**Out of scope:**
- Web onboarding (S206 — separate implementation)
- Detailed profile fields (daily routine, goals — V2)

---

### S305 — MMS image handling: receive, store, pass to Claude vision
**Type:** backend
**Points:** 3
**Depends on:** S302

**Goal:** When patients send images via MMS, store them and include them in the AI conversation.

**Scope:**
- In S302's async processing, after detecting `NumMedia > 0`:
  1. For each media URL (`MediaUrl0`, `MediaUrl1`, ...):
     - Download image from Twilio's temporary URL (authenticated with Twilio credentials)
     - Validate content type: accept `image/jpeg`, `image/png`, `image/gif`, `image/webp`; reject others silently
     - Upload to Supabase Storage: bucket `patient-media`, path `{patient_id}/{date}/{filename}`
     - Get public/signed URL from Supabase Storage
  2. Save media URLs to `messages.media_urls` array
  3. Include images in Claude context: use Vercel AI SDK's image support in message content
  4. Claude vision will describe/analyze the image as part of its response
- Storage bucket setup: create `patient-media` bucket in Supabase Storage (via migration or seed)
- Signed URLs: 24-hour expiry for dashboard viewing (S5)

**Edge cases:**
- Twilio media URLs expire after a few hours → must download promptly
- Large images: Twilio limits to 5MB per MMS. Reject and notify if somehow larger.
- Non-image media (video, audio) → reject silently, process text body only
- Multiple images in one MMS → process all, include all in Claude context
- Download failure from Twilio → log error, process text body without images

**Acceptance criteria:**
1. Patient sends image via MMS → image downloaded and stored in Supabase Storage
2. Image URL saved in `messages.media_urls`
3. Claude receives image and references it in response
4. Non-image media types ignored
5. Twilio download failure → text processed without image, error logged
6. Images viewable via signed URL in admin dashboard (S5)
7. Storage path follows `{patient_id}/{date}/{filename}` pattern

**Out of scope:**
- Sending images back to patient (not needed for V1)
- Image moderation/filtering (V2)
- Web chat image upload (V2)

---

### S306 — `log_metrics` AI tool: extract and store metrics
**Type:** AI/backend
**Points:** 5
**Depends on:** S201, S104, S110

**Goal:** Claude calls this tool to extract structured metrics from patient conversations and write to the database.

**Scope:**
- Define tool in `packages/ai-core/src/tools/log-metrics.ts`:
  ```typescript
  // Vercel AI SDK tool definition
  tool({
    description: 'Record patient health metrics from the conversation. Call this whenever the patient reports pain, discomfort, sitting tolerance, or exercise completion.',
    parameters: z.object({
      painLevel: z.number().min(1).max(10).optional().describe('Pain level 1-10'),
      discomfort: z.number().min(0).max(3).optional().describe('Discomfort level 0-3'),
      sittingToleranceMin: z.number().min(0).optional().describe('Sitting tolerance in minutes'),
      exercisesDone: z.array(z.string()).optional().describe('List of exercises completed'),
      notes: z.string().optional().describe('Additional context about the patient state'),
    }),
    execute: async (params, { patientId, supabase }) => {
      // Write to metrics table
      // Return confirmation string
    }
  })
  ```
- Tool execution:
  1. Validate parameters (Zod handles this)
  2. Insert into `metrics` table with `patient_id`, `recorded_at = now()`, `source_message_id`
  3. Return confirmation to Claude: "Recorded: discomfort 2, exercises completed: stretches, cat-cow"
  4. Claude includes this confirmation naturally in its response to the patient
- Tool is registered in `createConversation()` (S201) and available for both web and SMS channels

**Edge cases:**
- Patient mentions two different pain levels in one message ("was 4 this morning, now it's 2") → Claude should call tool twice or use the current value. System prompt should guide: "Record the most recent/current metric value."
- Patient says "I feel about the same" → Claude should NOT call tool (no specific number). Should ask follow-up.
- Patient mentions exercise but not by name ("I did my stretches") → record as `exercisesDone: ['stretches']`
- Ambiguous: "pain is moderate" → Claude should ask for a specific number, not guess
- Multiple metrics in one message ("discomfort 2, pain 3, sat for 40 minutes") → single tool call with all values

**Acceptance criteria:**
1. Claude correctly calls `log_metrics` when patient reports a specific number
2. Metrics saved to DB with correct values and `source_message_id`
3. Claude does NOT call tool for ambiguous inputs (asks follow-up instead)
4. Multiple metrics in one message → all captured in single tool call
5. Tool return value included in Claude's response naturally
6. Zod validation rejects out-of-range values (pain 11, discomfort 5, etc.)
7. Insert sets `exercise_count = exercisesDone.length` when `exercisesDone` is provided
8. Unit test: mock tool execution, verify DB write parameters
9. Integration test: send message with metrics → verify DB row created

**Out of scope:**
- Historical data correction ("actually yesterday was pain 3 not 4") → V2
- Exercise library reference (V2 — for now, free text exercise names)

---

### S307 — `get_history` AI tool: retrieve recent metrics for trend context
**Type:** AI/backend
**Points:** 2
**Depends on:** S201, S104

**Goal:** Claude can query the patient's recent metrics to reference trends in conversation.

**Scope:**
- Define tool in `packages/ai-core/src/tools/get-history.ts`:
  ```typescript
  tool({
    description: 'Get the patient recent health metrics to provide trend context. Call this when the patient asks how they are doing, or when you want to reference their progress.',
    parameters: z.object({
      days: z.number().min(1).max(30).default(7).describe('Number of days of history to retrieve'),
    }),
    execute: async ({ days }, { patientId, supabase }) => {
      // Query metrics table for last N days
      // Calculate averages
      // Return formatted summary
    }
  })
  ```
- Tool returns formatted summary:
  ```
  Last 7 days:
  - Avg pain: 2.3 (range: 1-4)
  - Avg discomfort: 1.8 (range: 1-3)
  - Avg sitting tolerance: 28 min
  - Exercises completed: 5/7 days
  - Trend: discomfort improving (was 2.1 last week)
  ```
- Calculate simple averages, min/max, and week-over-week trend direction

**Edge cases:**
- New patient with no metrics → "No metrics recorded yet. Let's start tracking today!"
- Only 2 days of data → show what exists, don't calculate trends
- Missing fields (some days have pain but not discomfort) → calculate avg only from non-null values

**Acceptance criteria:**
1. Tool returns formatted metric summary for last N days
2. Averages calculated correctly from non-null values only
3. New patient → appropriate empty message
4. Trend direction (improving/stable/worsening) calculated from week-over-week comparison
5. Claude uses the data naturally in conversation

**Out of scope:**
- Charts or visualizations (that's the web report — S4)
- Cross-patient comparisons

---

### S308 — Unified message storage: web + SMS share history
**Type:** backend
**Points:** 2
**Depends on:** S204, S302

**Goal:** Both web chat and SMS messages stored in the same table and visible from either channel.

**Scope:**
- Verify: S204 (web) and S302 (SMS) both write to `messages` table with `channel` field
- Web chat `useChat` hook: on page load, fetch ALL messages for patient (not filtered by channel)
- Context builder (S203): loads messages regardless of channel
- Message display in web chat: SMS messages show a small "SMS" badge to differentiate
- Web messages: no special badge

**Edge cases:**
- Patient sends SMS then opens web → sees SMS conversation in web chat
- Patient sends web message then SMS → AI has full context from both channels
- Timestamps from different channels may be slightly misaligned → sort by `created_at`

**Acceptance criteria:**
1. SMS message appears in web chat message list
2. Web message included in SMS AI context
3. Messages sorted by `created_at` regardless of channel
4. SMS messages show "via SMS" indicator in web UI
5. No duplicate messages across channels

**Out of scope:**
- Real-time sync (patient sees new SMS in web without refresh) — V2 with Supabase Realtime

---

### S309 — SMS opt-in/opt-out: STOP/START/HELP compliance
**Type:** backend
**Points:** 1
**Depends on:** S302

**Goal:** Handle carrier-required keywords for CASL and Twilio compliance.

**Scope:**
- In S302 webhook handler, before any other processing, check message body:
  - `STOP` (case-insensitive, exact match or contains) → set `patients.opted_out = true`, respond: "You've been unsubscribed from V-Health Recovery Coach. Reply START to re-subscribe."
  - `START` → set `patients.opted_out = false`, respond: "Welcome back! How are you feeling today?"
  - `HELP` → respond: "V-Health Recovery Coach helps you track your recovery. Reply STOP to unsubscribe. For urgent matters, call V-Health at [phone] or 911."
- Configure Twilio Advanced Opt-Out management in Twilio console (belt and suspenders — handle in code AND Twilio)
- All outbound SMS: check `opted_out` flag before sending. Never send to opted-out patients.

**Acceptance criteria:**
1. STOP → patient marked opted_out, confirmation sent, no further messages
2. START → patient reactivated, welcome message sent
3. HELP → info message with unsubscribe instructions
4. Opted-out patient: no outbound messages sent (nudges, reports, etc.)
5. Keywords work case-insensitively ("stop", "Stop", "STOP")

**Out of scope:**
- CASL express consent documentation (legal in S6)

---

### S310 — Twilio message SID idempotency
**Type:** backend
**Points:** 1
**Depends on:** S302

**Goal:** Prevent duplicate message processing when Twilio retries webhook delivery.

**Scope:**
- In S302, after signature validation and before processing:
  - Check `messages` table: `SELECT id FROM messages WHERE twilio_sid = $1`
  - If found: return 200 immediately (already processed)
  - If not found: proceed with processing
- The `twilio_sid` UNIQUE constraint (from S104) provides DB-level protection as backup
- Insert user message with `twilio_sid` as early as possible in the processing flow

**Acceptance criteria:**
1. First request with MessageSid X → processed normally
2. Second request with same MessageSid X → 200 returned, no reprocessing
3. DB constraint prevents duplicate inserts

---

### S311 — Unit tests: Twilio, SMS formatting, tools, idempotency
**Type:** testing
**Points:** 2
**Depends on:** S301-S310

**Goal:** Automated tests for Sprint 3 core logic.

**Scope:**
- Twilio signature validation: valid sig → pass, invalid → reject
- Phone number normalization: various formats → E.164
- SMS response formatting: under limit → as-is, over limit → truncated + link
- UCS-2 encoding detection for Chinese text
- `log_metrics` tool: verify DB write parameters, validation
- `get_history` tool: verify averages, trends, empty state
- Idempotency: duplicate SID → skip
- Opt-out keyword detection: STOP, START, HELP variants

**Acceptance criteria:**
1. `pnpm test` passes all Sprint 3 tests
2. 25+ test cases
3. All SMS formatting edge cases covered
4. Tool parameter validation tested
