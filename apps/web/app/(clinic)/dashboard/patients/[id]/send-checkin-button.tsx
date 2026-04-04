'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-react'

interface SendCheckinButtonProps {
  patientId: string
  patientName: string | null
  optedOut: boolean
  hasPhone: boolean
}

export function SendCheckinButton({ patientId, patientName, optedOut, hasPhone }: SendCheckinButtonProps) {
  const [sending, setSending] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState(
    `Hi ${patientName ?? 'there'}, this is V-Health. How are you feeling? We'd love to hear an update.`
  )
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const disabled = optedOut || !hasPhone

  async function handleSend() {
    setSending(true)
    setStatus('idle')
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/send-checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        throw new Error(data.error)
      }
      setStatus('success')
      setShowForm(false)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  if (!showForm) {
    return (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => setShowForm(true)}
          title={optedOut ? 'Patient has opted out' : !hasPhone ? 'No phone number' : undefined}
        >
          <Send className="mr-1 h-3.5 w-3.5" />
          Send Check-in
        </Button>
        {status === 'success' && (
          <span className="text-xs text-green-600">Check-in sent to {patientName}</span>
        )}
        {status === 'error' && (
          <span className="text-xs text-red-600">{errorMsg}</span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Send Check-in SMS</p>
      <textarea
        className="w-full rounded-md border bg-background p-2 text-sm"
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSend} disabled={sending || !message.trim()}>
          {sending ? 'Sending...' : 'Send'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} disabled={sending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
