'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import { SuggestedChips } from './suggested-chips'
import { HandoffButtons } from './handoff-buttons'
import { LeadForm } from './lead-form'

type Msg = { role: 'user' | 'assistant' | 'system'; content: string }

declare global { interface Window { turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset?: () => void } } }

export function ChatPanel({ clinicSlug, clinicName, phone, turnstileSiteKey }: {
  clinicSlug: string; clinicName: string; phone: string; turnstileSiteKey: string
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leadOpen, setLeadOpen] = useState(false)
  const [leadDone, setLeadDone] = useState(false)
  const turnstileRef = useRef<HTMLDivElement | null>(null)
  const turnstileTokenRef = useRef<string | null>(null)
  const sessionTokenRef = useRef<string | null>(null)

  // Render Turnstile once
  useEffect(() => {
    if (!turnstileSiteKey || !turnstileRef.current) return
    const tryRender = () => {
      if (!window.turnstile || !turnstileRef.current) return false
      window.turnstile.render(turnstileRef.current, {
        sitekey: turnstileSiteKey, size: 'invisible',
        callback: (tok: string) => { turnstileTokenRef.current = tok },
      })
      return true
    }
    const iv = setInterval(() => { if (tryRender()) clearInterval(iv) }, 250)
    return () => clearInterval(iv)
  }, [turnstileSiteKey])

  const ensureSession = useCallback(async () => {
    if (sessionTokenRef.current && conversationId) return sessionTokenRef.current
    const res = await fetch('/api/widget/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinicSlug, turnstileToken: turnstileTokenRef.current ?? '' }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to start session'); return null }
    setConversationId(data.conversationId)
    sessionTokenRef.current = data.token ?? null
    return sessionTokenRef.current
  }, [clinicSlug, conversationId])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || sending) return
    setError(null); setSending(true); setInput('')
    setMessages(m => [...m, { role: 'user', content: text }])
    const token = await ensureSession()
    if (!token) { setSending(false); return }
    try {
      const res = await fetch('/api/widget/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, message: text }),
      })
      const data = await res.json()
      setMessages(m => {
        const next = [...m, { role: 'assistant' as const, content: data.reply ?? 'Something went wrong.' }]
        const userCount = next.filter(msg => msg.role === 'user').length
        if (data.show_lead_form === true || userCount >= 3) setLeadOpen(true)
        return next
      })
      if (data.locked) setError('This chat is locked. Please refresh to start a new one.')
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Sorry, something went wrong. Please text us at ' + phone }])
    } finally { setSending(false) }
  }, [ensureSession, phone, sending])

  return (
    <div className="flex h-full flex-col bg-white text-black">
      <header className="border-b p-3 font-semibold">{clinicName} — Online Assistant</header>
      <div className="flex-1 overflow-y-auto p-3 space-y-3" data-testid="chat-log">
        {messages.length === 0 && <SuggestedChips onPick={send} />}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <div className={'inline-block max-w-[85%] rounded-xl px-3 py-2 ' +
              (m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100')}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && <div className="text-gray-500 text-sm">Typing…</div>}
        {error && <div className="text-red-600 text-sm">{error}</div>}
      </div>
      <HandoffButtons phone={phone} />
      {leadOpen && !leadDone && conversationId && sessionTokenRef.current && (
        <div className="border-t p-2">
          <LeadForm
            token={sessionTokenRef.current}
            onDone={() => { setLeadDone(true); setLeadOpen(false) }}
          />
        </div>
      )}
      <form
        onSubmit={e => { e.preventDefault(); send(input) }}
        className="flex gap-2 border-t p-2"
      >
        <input
          value={input} onChange={e => setInput(e.target.value)}
          maxLength={500} placeholder={`Ask ${clinicName} a question…`}
          className="flex-1 rounded border px-3 py-2"
          disabled={sending}
        />
        <button type="submit" disabled={sending || !input.trim()}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">Send</button>
      </form>
      <div ref={turnstileRef} aria-hidden />
      {turnstileSiteKey && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      )}
    </div>
  )
}
