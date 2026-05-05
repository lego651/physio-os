# Path A Spike — Telegram Voice Intake Runbook

## Goal

Validate that OpenAI Whisper + Anthropic field extraction can pull
clinic-grade structured data out of real physio-jargon voice memos
sent through Telegram. **Two-hour timebox.** The decision criterion
is simple: send 3 voice clips through the bot, score the returned
record on 5 fields each, and decide GO (continue with Path A in
production) or NO-GO (fall back to the in-app MediaRecorder path
already shipped in T6).

**GO threshold:** ≥ 12/15 fields correct AND no single clip below 4/5.
Anything else is NO-GO.

## Prerequisites

- Telegram account on your phone with @BotFather conversation open
- Vercel preview URL of the current branch (`feat/phase1-voice-intake`)
  with **Task 4** (`/api/intake/telegram-webhook`) shipped — verify
  it returns `401 Unauthorized` (not `404`) when hit without the
  secret header
- OpenClaw VPS shell access (Node 20+ available — the bot uses
  built-in `fetch` / `FormData`)
- `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` already configured on the
  Vercel project (the webhook needs them to do Whisper + extraction)

## Setup

1. **Create the Telegram bot.** Open @BotFather on your phone,
   `/newbot`, give it a name (e.g. `physio-os-spike-bot`), copy the
   token it returns. Treat the token like a password — anyone with
   it can drive the bot.

2. **Deploy the current branch to a Vercel preview.**

   ```bash
   cd /Users/lego/@Lego651/physio-os-p1
   vercel deploy
   ```

   Note the preview URL (e.g. `https://physio-os-abc123.vercel.app`).
   The webhook lives at `<preview>/api/intake/telegram-webhook`.

3. **Generate a webhook secret.**

   ```bash
   openssl rand -hex 16
   ```

   Save the value — you will set it in two places (Vercel + VPS).

4. **Set Vercel env vars** for the preview environment. Either via
   the dashboard or:

   ```bash
   vercel env add INTAKE_WEBHOOK_SECRET preview     # paste the openssl output
   vercel env add OPENAI_API_KEY preview            # if not already set
   vercel env add ANTHROPIC_API_KEY preview         # if not already set
   vercel env add VHEALTH_GOOGLE_MAPS_REVIEW_URL preview   # if not already set
   ```

   Re-deploy after adding env vars so the running preview picks them
   up: `vercel deploy`.

5. **Copy `bot.js` to the OpenClaw VPS, install deps, set env vars.**

   ```bash
   # on your laptop
   scp docs/spike/bot.js openclaw:~/physio-spike/bot.js

   # on the VPS
   cd ~/physio-spike
   npm init -y
   npm install node-telegram-bot-api

   export TELEGRAM_BOT_TOKEN='<from BotFather>'
   export PHYSIO_WEBHOOK_URL='https://<preview>.vercel.app/api/intake/telegram-webhook'
   export PHYSIO_WEBHOOK_SECRET='<the openssl hex>'
   ```

6. **Run the bot in a detached session** so it survives SSH
   disconnect.

   ```bash
   tmux new -s physio-bot
   node bot.js
   # Ctrl-b then d to detach
   ```

   You should see `[bot] polling started`. Send `/start` to the bot
   from your phone — it should reply within a second.

## Test execution

Open `path-a-outcome.md` (next door) — it has the three clip scripts.
Record each clip on your phone (20–40 seconds, normal speaking
voice, no background noise) and send it as a **voice memo** (hold
the mic button in Telegram, NOT a file attachment) to the bot.

For each voice memo, the bot will reply with the extracted record
within roughly 10–30 seconds (Whisper + Claude latency dominates).
Capture the reply text — you will copy each field into the outcome
table.

If the bot replies with an error, check the tmux session output for
`[bot] webhook response` and `[bot] handler error` log lines, then
the Vercel runtime logs for the route. Most common failures: bad
secret, missing OPENAI_API_KEY, or Whisper rejecting silent audio.

## Score the results

Fill in `path-a-outcome.md`. For each field, mark `✓` if the value
is "close enough for clinic use" — exact name match, plausible
date, treatment area named, session notes capture the substance.
Mark `✗` if a human would have to redo the field.

Compute total `X/15`. Then:

- **X ≥ 12 AND every clip ≥ 4/5 → GO** — Path A wins. Continue
  with Task 4 polish + ship the bot to production on the VPS.
- **Anything else → NO-GO** — Skip to Task 5. The MediaRecorder
  path already built in T6 becomes the production intake flow.

## Cleanup

```bash
# on the VPS
tmux attach -t physio-bot
# Ctrl-c to stop the bot
tmux kill-session -t physio-bot
```

Optional but recommended after the spike:

- Rotate the bot token in @BotFather (`/revoke`) so the spike token
  cannot be reused.
- Rotate `INTAKE_WEBHOOK_SECRET` if you intend to keep the preview
  URL alive.
- Remove the bot from the chat (Telegram → bot profile → "Stop and
  Block bot") so stray voice memos do not pile up.

If you went GO, leave the VPS bot running and move to Task 4
production hardening. If NO-GO, tear the VPS bot down and proceed
with Path B in Task 5.
