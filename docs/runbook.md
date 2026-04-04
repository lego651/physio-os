# V-Health Recovery Coach — Internal Operations Runbook

**Version:** 1.0
**Last updated:** 2026-04-03
**Audience:** V-Health admin and platform operator (founder)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [How to Add a Patient](#2-how-to-add-a-patient)
3. [How to Check Patient Data](#3-how-to-check-patient-data)
4. [How to Handle a Safety Alert](#4-how-to-handle-a-safety-alert)
5. [How to Handle a Patient Complaint](#5-how-to-handle-a-patient-complaint)
6. [How to Check SMS Costs](#6-how-to-check-sms-costs)
7. [How to Contact Platform Support](#7-how-to-contact-platform-support)
8. [Known Limitations](#8-known-limitations)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. System Overview

V-Health Recovery Coach is a web application deployed at **https://vhealth.ai**. It helps physiotherapy patients track their recovery between clinic appointments via:

- **SMS coaching** — patients text a Twilio number and the AI responds, extracting metrics automatically
- **Web chat** — patients access `vhealth.ai/chat` on their phone or computer
- **Weekly reports** — automatically generated and sent to patients every week with a progress summary
- **Admin dashboard** — the clinic team monitors all patients, reviews metrics, and manages the roster at `vhealth.ai/dashboard`

**Core components:**
| Component | URL / Contact |
|-----------|---------------|
| Admin dashboard | https://vhealth.ai/dashboard |
| Patient web chat | https://vhealth.ai/chat |
| Privacy policy | https://vhealth.ai/privacy |
| Hosting | Vercel |
| Database | Supabase (AWS) |
| SMS | Twilio |
| AI | Anthropic Claude |
| Error monitoring | Sentry |

---

## 2. How to Add a Patient

### Step-by-step

1. Go to **https://vhealth.ai/dashboard** and log in with your admin credentials.
2. On the Patients page, click **Add Patient**.
3. Fill in the required fields:
   - **Phone number** (required) — must include country code, e.g. `+16041234567`
   - **Name** (optional at this stage — the patient will provide it during SMS onboarding)
   - **Practitioner name** (optional — used for reference in the dashboard)
4. Click **Save**.

### What happens next

The patient record is created immediately. The system sends a welcome SMS to the patient:

> "Welcome to V-Health Recovery Coach! By continuing, you agree to our privacy policy: https://vhealth.ai/privacy. Reply YES to continue or STOP to opt out."

The patient then completes a 4-step SMS onboarding:
1. Reply **YES** to consent
2. Provide their **name**
3. Describe their **condition** (e.g., "back pain")
4. Select **language**: reply `1` for English or `2` for Chinese

Once onboarding is complete, the patient can message freely via SMS or at `vhealth.ai/chat`.

### Patient statuses in the dashboard

| Status | Meaning |
|--------|---------|
| **Active** | Messaged within the last 4 days |
| **New** | Enrolled within the last 7 days |
| **Inactive** | No message for 5+ days |
| **Alert** | Latest pain report is 2+ points above their 7-day average |

---

## 3. How to Check Patient Data

### Patient list overview

The dashboard home (`/dashboard/patients`) shows:
- Total active patients, active this week, messages this week
- Average discomfort this week vs. last week
- Per-patient: latest pain, latest discomfort, exercise days this week, days since last message, status badge

### Individual patient detail

Click any patient row to open their detail page. This page includes:

- **Profile card** — name, language, enrollment date, practitioner, condition
- **Metric overview cards** — latest pain level, discomfort, sitting tolerance, exercise count
- **Trend chart** — pain and discomfort over time (visual graph)
- **Metrics table** — full history of every reported metric with timestamps
- **Conversation log** — full SMS and web chat history, including MMS images
- **Weekly reports** — all generated reports for that patient with links

### Metrics tracked

| Metric | Description |
|--------|-------------|
| Pain level | 0–10 scale, self-reported |
| Discomfort | 0–3 scale (0 = none, 3 = severe) |
| Sitting tolerance | Minutes patient can sit comfortably |
| Exercises done | Which exercises the patient completed |
| Exercise count | Number of exercises completed |
| Notes | Free-text notes from patient messages |

### Sending a manual check-in

On the patient detail page, click **Send Check-in** to send the patient a prompt asking how they are feeling. This is useful if a patient has been inactive and you want to re-engage them without waiting for the automated nudge.

---

## 4. How to Handle a Safety Alert

### What triggers an alert

The system detects emergency language — such as extreme pain reports, statements of distress, or crisis indicators — in both English and Chinese. When triggered:

1. The patient immediately receives a hardcoded response (not AI-generated):
   > "It sounds like you may need immediate help. Please contact V-Health at [clinic phone] or call 911 if this is an emergency."

2. An email is sent to the admin email address (`ADMIN_EMAIL`) with:
   - Patient name and phone number
   - The exact message that triggered the alert
   - Timestamp

3. A Sentry warning event is logged for the platform operator.

### What to do when you receive an alert email

1. **Review the patient's conversation log** — go to the patient's detail page in the dashboard and read the full context. The triggering message is saved with an emergency flag.
2. **Assess the situation:**
   - If it appears to be a genuine emergency: call the patient directly or contact emergency services.
   - If it appears to be a false positive (e.g., "that workout killed me" — figurative language): no action required, but consider following up with the patient at the next appointment.
3. **Document your response** — note what you did in the patient's clinic file (outside V-Health, V1 has no in-app notes field).

### False positive policy

The system is calibrated to over-escalate rather than miss real emergencies. False positives are expected and normal — the alert email is a prompt to review, not a confirmed crisis.

---

## 5. How to Handle a Patient Complaint

### Types of complaints and responses

**"The AI gave me bad advice"**
- Review the conversation log for the patient in the dashboard.
- The AI is not permitted to give medical advice. If the AI stayed within its scope, reassure the patient.
- If the AI genuinely overstepped: document the example, contact platform support (see Section 7), and report to Anthropic if needed.

**"I'm not receiving SMS messages"**
- Check the patient's record in the dashboard:
  - Is `opted_out` set to true? If so, they texted STOP. Ask them to text START to re-subscribe.
  - Is their phone number correct (including country code)?
- See Troubleshooting (Section 9) for SMS delivery issues.

**"I want my data deleted"**
- V1 does not have automated data deletion. To delete a patient's data manually:
  1. Contact platform support (see Section 7) to run a database deletion.
  2. Inform the patient their data has been removed within a reasonable timeframe (PIPEDA: 30 days is standard).

**"I want to stop receiving messages"**
- Instruct the patient to text **STOP** to the V-Health SMS number. This immediately opts them out.
- Alternatively, deactivate the patient in the dashboard (Toggle Active button on the patient detail page).

---

## 6. How to Check SMS Costs

### Current method (V1)

SMS costs are managed through the Twilio console:

1. Go to **https://console.twilio.com** and log in.
2. Navigate to **Monitor > Billing > Usage**.
3. Filter by date range to see messages sent and total cost.

Typical costs (Twilio Canada long-code):
- Outbound SMS: ~$0.0079 USD per message
- Inbound SMS: ~$0.0075 USD per message

### Automated cost alert

The system sends an admin email alert when monthly SMS spend reaches **$40 USD**. This alert is checked daily by a background cron job. If you receive this alert, review usage in the Twilio console and determine if the volume is expected.

### Settings page

The dashboard Settings page (`/dashboard/settings`) is a placeholder in V1 — detailed cost reporting within the app is planned for a future release. All cost management is done via the Twilio console for now.

---

## 7. How to Contact Platform Support

Platform support is handled by the V-Health founder/developer.

**For technical issues (outages, bugs, data requests):**
- Contact the founder directly via the agreed support channel (phone/email/Signal).
- For production outages: check **https://vercel.com/status** and **https://status.supabase.com** first — some issues are upstream.

**What to include in your support request:**
- Description of the issue
- When it started
- Affected patient(s) — name and phone (do not send full conversation logs over unsecured channels)
- Any error messages you see

**Monitoring:**
- Errors are automatically captured in **Sentry** and the founder receives alert emails.
- For minor issues the founder may already be aware before you reach out.

---

## 8. Known Limitations

The following features are intentionally not in V1 and are planned for future releases:

| Limitation | Details |
|------------|---------|
| No appointment booking | V-Health Recovery Coach does not integrate with scheduling systems. Appointments are managed through the clinic's existing tools. |
| No exercise library | The AI can discuss exercises in general terms but cannot prescribe specific exercise routines or reference a library. |
| No automated data deletion | Patient data must be deleted manually by the platform operator on request. |
| Single admin account | Only one admin login is supported. There is no multi-user or role-based access. |
| No in-app note-taking | Clinicians cannot add notes to patient records within the dashboard. Use the clinic's existing case management tools. |
| No appointment reminders | The app sends recovery check-ins and weekly reports only — not appointment reminders. |
| No image analysis | If a patient sends a photo via MMS, it appears in the conversation log but the AI does not analyze it. |
| Settings page not functional | The `/dashboard/settings` page is a placeholder. Configuration changes require platform operator involvement. |
| English and Chinese only | The AI supports English and Simplified Chinese. Other languages are not supported. |
| No multi-clinic support | V1 is a single-clinic deployment. All patients belong to one clinic. |
| No GDPR compliance | The system is designed for the Canadian market under PIPEDA. GDPR compliance is out of scope for V1. |

---

## 9. Troubleshooting

### Patient not receiving SMS

1. **Check opt-out status** — open the patient in the dashboard. If `opted_out` is true, the patient previously texted STOP. Ask them to text START to re-subscribe.
2. **Check phone number format** — must be E.164 format with country code: `+16041234567` not `6041234567`.
3. **Check Twilio console** — go to `console.twilio.com` > Monitor > Logs > Messaging. Search for the patient's number to see delivery status and any error codes.
4. **Twilio error codes:**
   - `30003` — Unreachable destination handset (phone off or not in service area)
   - `30004` — Message blocked (carrier filtering or patient blocked the number)
   - `30005` — Unknown destination handset
   - `30006` — Landline or unreachable carrier
   - `21610` — Attempted to send to a number that has opted out
5. **If delivery keeps failing** — contact platform support with the Twilio error code and patient phone number.

### Patient completed onboarding but AI is not responding to messages

1. Check that the patient's record shows `consent_at` is set and `name`, `injury`, and `language` are all populated in the dashboard profile card.
2. If any onboarding field is missing, the system treats the patient as still in onboarding and asks for the missing field instead of routing to the AI.
3. Check Sentry for any errors around the time of the patient's last message — there may be a Claude API failure.
4. Contact platform support if the issue persists.

### AI giving unexpected responses

1. Check the conversation log in the dashboard — read the exact messages exchanged.
2. The AI is constrained to recovery coaching topics only. If it appears to be responding outside its scope, note the exact messages and contact platform support.
3. The AI automatically responds in the patient's preferred language. If it is responding in the wrong language, check the patient's language setting in the dashboard.

### Dashboard not loading

1. Try a hard refresh (`Cmd+Shift+R` on Mac, `Ctrl+Shift+R` on Windows).
2. Try a different browser or incognito window.
3. Check **https://vercel.com/status** for platform-wide issues.
4. Contact platform support if the dashboard is still down after 5 minutes.

### Weekly report not sent

1. Reports are generated automatically every Monday. If a patient did not receive their report, check:
   - Patient's `opted_out` status — opted-out patients do not receive reports.
   - Patient's activity — reports may not be generated for patients with no data that week.
2. You can trigger a report manually for a patient by contacting platform support.

### Admin email not receiving alert notifications

1. Check your spam/junk folder — Sentry and emergency alerts can sometimes be filtered.
2. Verify the `ADMIN_EMAIL` environment variable is correct — contact platform support.
3. The system uses Resend for transactional email. Check **https://resend.com/status** for delivery issues.
