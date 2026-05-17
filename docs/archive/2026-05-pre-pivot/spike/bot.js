/**
 * Telegram → physio-os bridge (Path A spike)
 *
 * Standalone Node script. Lives on the OpenClaw VPS, NOT in the
 * Vercel/Next.js runtime. Run with:
 *
 *   node bot.js
 *
 * Dependencies (install on the VPS, not in this monorepo):
 *
 *   npm install node-telegram-bot-api
 *
 * Node 20+ provides `fetch`, `FormData`, and `Blob` natively — no
 * node-fetch / form-data shims needed.
 *
 * Environment variables (required):
 *   TELEGRAM_BOT_TOKEN     — token from @BotFather
 *   PHYSIO_WEBHOOK_URL     — e.g. https://physio-os-abc.vercel.app/api/intake/telegram-webhook
 *   PHYSIO_WEBHOOK_SECRET  — must match INTAKE_WEBHOOK_SECRET in the Vercel project
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const TelegramBot = require('node-telegram-bot-api')

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const PHYSIO_WEBHOOK_URL = process.env.PHYSIO_WEBHOOK_URL
const PHYSIO_WEBHOOK_SECRET = process.env.PHYSIO_WEBHOOK_SECRET

function requireEnv(name, value) {
  if (!value) {
    console.error(`[bot] missing required env var: ${name}`)
    process.exit(1)
  }
  return value
}

requireEnv('TELEGRAM_BOT_TOKEN', TELEGRAM_BOT_TOKEN)
requireEnv('PHYSIO_WEBHOOK_URL', PHYSIO_WEBHOOK_URL)
requireEnv('PHYSIO_WEBHOOK_SECRET', PHYSIO_WEBHOOK_SECRET)

// Verify Node version supports built-in fetch / FormData / Blob (Node 20+).
const major = Number(process.versions.node.split('.')[0])
if (major < 20) {
  console.error(`[bot] requires Node 20+ (running ${process.versions.node})`)
  process.exit(1)
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true })

console.log('[bot] polling started')
console.log(`[bot] webhook target: ${PHYSIO_WEBHOOK_URL}`)

bot.on('polling_error', (err) => {
  console.error('[bot] polling error', { message: err.message })
})

bot.on('voice', async (msg) => {
  const chatId = msg.chat.id
  const fileId = msg.voice.file_id
  const durationSec = msg.voice.duration

  console.log('[bot] received voice memo', {
    chatId,
    fileId,
    durationSec,
    fromUsername: msg.from && msg.from.username,
  })

  let tmpFilePath = null
  try {
    // 1. Download the audio file from Telegram to a temp path.
    //    bot.downloadFile returns the absolute path on disk.
    tmpFilePath = await bot.downloadFile(fileId, '/tmp')
    console.log('[bot] downloaded voice file', { tmpFilePath })

    // 2. Read it back as a Buffer and POST as multipart form-data.
    const audioBuffer = fs.readFileSync(tmpFilePath)
    const filename = path.basename(tmpFilePath) || 'voice.ogg'

    const form = new FormData()
    // Telegram voice memos are OGG/Opus.
    const blob = new Blob([audioBuffer], { type: 'audio/ogg' })
    form.append('audio', blob, filename)
    form.append('chat_id', String(chatId))

    const startedAt = Date.now()
    const resp = await fetch(PHYSIO_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'x-webhook-secret': PHYSIO_WEBHOOK_SECRET,
      },
      body: form,
    })
    const elapsedMs = Date.now() - startedAt

    console.log('[bot] webhook response', {
      status: resp.status,
      ok: resp.ok,
      elapsedMs,
    })

    const text = await resp.text()
    let payload = null
    try {
      payload = JSON.parse(text)
    } catch {
      // non-JSON body — leave payload null and fall through to error reply
    }

    if (resp.ok && payload && payload.record) {
      const r = payload.record
      const reply = [
        'Record saved.',
        `Patient: ${r.patient_name ?? 'n/a'}`,
        `Therapist: ${r.therapist_name ?? 'n/a'}`,
        `Date: ${r.date_of_visit ?? 'n/a'}`,
        `Area: ${r.treatment_area ?? 'n/a'}`,
        `Notes: ${r.session_notes ?? 'n/a'}`,
        `Record ID: ${r.id ?? 'n/a'}`,
      ].join('\n')

      const warnings = Array.isArray(payload.warnings) ? payload.warnings : []
      const replyWithWarnings = warnings.length
        ? `${reply}\n\nWarnings: ${warnings.join('; ')}`
        : reply

      await bot.sendMessage(chatId, replyWithWarnings)
    } else {
      const errMsg =
        (payload && (payload.error || payload.message)) ||
        text.slice(0, 200) ||
        `HTTP ${resp.status}`
      console.warn('[bot] webhook failure', { status: resp.status, errMsg })
      await bot.sendMessage(chatId, `Error (${resp.status}): ${errMsg}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[bot] handler error', {
      message,
      stack: err instanceof Error ? err.stack : undefined,
    })
    try {
      await bot.sendMessage(chatId, `Bridge error: ${message.slice(0, 200)}`)
    } catch (replyErr) {
      console.error('[bot] failed to reply with error', {
        message: replyErr instanceof Error ? replyErr.message : String(replyErr),
      })
    }
  } finally {
    // Best-effort cleanup of the temp file.
    if (tmpFilePath) {
      fs.unlink(tmpFilePath, (err) => {
        if (err) {
          console.warn('[bot] could not delete temp file', {
            tmpFilePath,
            message: err.message,
          })
        }
      })
    }
  }
})

// Friendly /start so Jason can confirm the bot is alive before recording.
bot.onText(/^\/start\b/, (msg) => {
  console.log('[bot] /start', { chatId: msg.chat.id })
  bot
    .sendMessage(
      msg.chat.id,
      'physio-os spike bot online. Send a voice memo to test the pipeline.',
    )
    .catch((err) => {
      console.error('[bot] /start reply failed', { message: err.message })
    })
})

// Surface unexpected text so Jason knows the bot is ignoring it on purpose.
bot.on('message', (msg) => {
  if (msg.voice || (msg.text && msg.text.startsWith('/'))) return
  console.log('[bot] non-voice message ignored', {
    chatId: msg.chat.id,
    hasText: Boolean(msg.text),
  })
})

process.on('SIGINT', () => {
  console.log('[bot] SIGINT — stopping polling')
  bot.stopPolling().finally(() => process.exit(0))
})
process.on('SIGTERM', () => {
  console.log('[bot] SIGTERM — stopping polling')
  bot.stopPolling().finally(() => process.exit(0))
})
