# Path A Spike Outcome — Telegram Voice Intake

**Date:** YYYY-MM-DD
**Tech Lead:** Jason
**Decision:** [GO / NO-GO]

---

## Test clip scripts

Record each clip on your phone (20–40 seconds, normal speaking
voice) and send as a Telegram **voice memo** to the spike bot.
Read the script verbatim — substituting only the bracketed
`[today's date]` in clip 1 with the actual session date you want
the model to extract.

### Clip 1

> Patient is John Smith. Today is [today's date]. I'm David. We
> worked on lower back stabilization — L4-L5 area. Patient had
> some lumbar tightness, we did manual therapy and McKenzie
> exercises, patient reported 70% improvement in pain by end of
> session.

### Clip 2

> Sarah Chen came in today for her right shoulder follow-up.
> Rotator cuff impingement treatment. We did ultrasound therapy
> and some active release technique on the supraspinatus. She's
> progressing well, range of motion improved by about 20 degrees.

### Clip 3

> This is a session note for Mike Johnson. Knee rehab post-ACL
> surgery, week 6. We focused on quad strengthening, single-leg
> press and terminal knee extension exercises. No pain during
> session. Ice applied post-session.

---

## Accuracy table

Mark `✓` if the field is "close enough for clinic use" (a human
would accept it without rewriting). Mark `✗` if it is wrong,
missing, or would need to be redone manually.

| Clip  | patient_name | date_of_visit | therapist_name | treatment_area | session_notes | Score |
|-------|--------------|---------------|----------------|----------------|---------------|-------|
| 1     | ✓/✗          | ✓/✗           | ✓/✗            | ✓/✗            | ✓/✗           | /5    |
| 2     | ✓/✗          | ✓/✗           | ✓/✗            | ✓/✗            | ✓/✗           | /5    |
| 3     | ✓/✗          | ✓/✗           | ✓/✗            | ✓/✗            | ✓/✗           | /5    |
| Total |              |               |                |                |               | /15   |

**Go/No-Go threshold:** GO requires total ≥ 12/15 AND every clip ≥ 4/5.
Anything else is NO-GO.

---

## Notes

Capture anything worth remembering for the production decision:

- End-to-end latency per clip (voice send → bot reply)
- OpenClaw VPS issues (token, polling errors, network)
- Whisper transcript quality vs Claude extraction quality (which
  layer caused which mistake?)
- Prompt drift — fields the extractor invented, dropped, or
  reformatted unexpectedly
- Anything you would want hardened before this hits a real patient
  session

---

## Path Chosen

**[Path A / Path B]** — proceeding with Task **[4 / 5]**.

- **Path A** (GO): keep the Telegram bot bridge, harden Task 4
  for production, run the bot on the VPS under a process manager.
- **Path B** (NO-GO): retire the bot, ship the in-app
  MediaRecorder fallback already built in T6 as the production
  intake flow.
