# Phase 1 demo runbook — May 20 with David at V-Health

Single-page runbook for prepping and running the May 20 demo. Print or keep open on a second screen during the session.

---

## Pre-deploy checklist

Complete BEFORE the demo, ideally May 18–19.

- [ ] Apply migration `012_intake_records.sql` to the Supabase **production** project
      (`npx supabase db push --linked`)
- [ ] Run `supabase/seed-intake-demo.sql` against production Supabase
      (paste the file contents in the Supabase dashboard SQL editor and click **Run**)
- [ ] Set Vercel **production** env vars (use `vercel env add <NAME> production` per the README):
  - [ ] `OPENAI_API_KEY` (existing — verify still set)
  - [ ] `ANTHROPIC_API_KEY` (existing — verify still set)
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` (existing — verify still set)
  - [ ] `INTAKE_WEBHOOK_SECRET` (NEW — generate with `openssl rand -hex 16`)
  - [ ] `VHEALTH_GOOGLE_MAPS_REVIEW_URL` (NEW — set to `https://maps.app.goo.gl/vXTsKso2phwUaFG87` per the locked decision)
  - [ ] Optional: `ADMIN_EMAIL` (existing — confirm David's account email matches)
- [ ] Create David's Supabase Auth account (email magic-link based, no password — see the `/staff/intake` page note)
- [ ] (Optional, Path A only) Run T3 spike to validate Telegram bot accuracy.
      If skipping the spike, that's fine — Path B (in-app intake) is enough for the demo.
- [ ] Deploy: merge `feat/phase1-voice-intake` to main, Vercel auto-deploys.
      OR run `vercel --prod` if not connected to git.
- [ ] After deploy, smoke-test the 4 routes hit a 200/redirect, not a 500:
  - `https://<prod>/staff/intake` (should redirect to login)
  - `https://<prod>/dashboard/intake` (should redirect to login)
  - `https://<prod>/review` (should load the public review page)
  - `https://<prod>/review/test-success` (will be reachable in production since it's a public route — that's fine; nobody knows the URL. In prod the `/review` page links DIRECTLY to V-Health's Google Maps URL, so test-success is just an unused stub in production.)

---

## Demo script (May 20 — 11 min total)

A single sequence to walk David through.

1. **Voice intake (4 min)**
   Open `/staff/intake` on iPhone → record a voice memo of a fake session →
   fields auto-fill → save → verify the new record shows up at the top of `/dashboard/intake`.

2. **Dashboard (3 min)**
   Show the dashboard with the 5 seed entries plus the just-saved record at the top.
   Click into one entry to show the detail view.

3. **PDF export (2 min)**
   Click any record → **Print / Download PDF** → save the PDF and show David what
   the patient file looks like (clean — no sidebar, no nav).

4. **Review assistant (2 min)**
   Open `/review` on iPhone → type "shoulder much better" → AI draft appears →
   tap **Copy** → tap **Open Google Maps**. **SHOW BUT DO NOT POST** (per the May 20
   demo protocol — when a real patient does this after a real visit, that's a real
   Google review).

---

## What to bring

- Jason's iPhone (logged into the staff account)
- Laptop (for the dashboard view at the desk)
- Printer OR Jason's laptop (for the PDF demo — saving as PDF and showing on screen
  is fine; physical printing is optional)
- A printed business-card-sized QR code for `/review` (for the front desk —
  generated separately with the final production URL)

---

## Success criteria

- Voice intake works end-to-end without a hang or error
- Dashboard list and detail pages render in <2s
- PDF export looks clean (no sidebar, no nav, no shadow artifacts)
- AI review draft generates in <5s and is plausible
- David sees a credible "this could work in my clinic" moment

---

## Post-demo

- Capture David's feedback (verbal or written)
- File a follow-up note: did he commit to the pilot? What did he flag as a blocker?
  What features did he ask for?
- Update `Projects/physio-os/index.md` in the life-os vault with the demo outcome
  (status: pilot signed / pilot pending / pilot declined)

---

## Risk notes (from the plan's Risk Register)

- **iOS Safari MediaRecorder needs iOS 14.5+.** Most modern iPhones are fine.
  T6's `pickExtension` helper handles iOS Safari's `audio/mp4` blobs.
- **Vercel function `maxDuration` is 60s.** A 30–40s Whisper + Claude call should
  fit, but cold starts can be tight.
- **David's Supabase Auth account must be created before he ever taps the staff
  intake link**, or he'll see the magic-link login screen and need to set it up
  live during the demo.
