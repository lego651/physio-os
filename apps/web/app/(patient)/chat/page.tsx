'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SendHorizontal, HelpCircle, Loader2, AlertCircle, ChevronUp } from 'lucide-react'
import type { UIMessage } from 'ai'

const MESSAGES_PER_PAGE = 50
const MAX_MESSAGE_LENGTH = 2000

function MetricBadge({ metric }: { metric: { name: string; value: number | string; trend?: string } }) {
  const colorMap: Record<string, string> = {
    pain: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    discomfort: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    sitting_tolerance: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
    exercises: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  }

  const color = colorMap[metric.name] || 'bg-muted text-muted-foreground'
  const label = metric.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}: {metric.value}
      {metric.trend && <span>{metric.trend}</span>}
    </span>
  )
}

function extractMetricsFromParts(message: UIMessage): Array<{ name: string; value: number | string }> {
  const metrics: Array<{ name: string; value: number | string }> = []
  for (const part of message.parts) {
    if (part.type.startsWith('tool-') && part.type === 'tool-log_metrics') {
      const input = (part as { input: Record<string, unknown> }).input
      if (input.pain_level != null) metrics.push({ name: 'pain', value: input.pain_level as number })
      if (input.discomfort != null) metrics.push({ name: 'discomfort', value: input.discomfort as number })
      if (input.sitting_tolerance_min != null) metrics.push({ name: 'sitting_tolerance', value: `${input.sitting_tolerance_min}min` })
      if (input.exercise_count != null) metrics.push({ name: 'exercises', value: input.exercise_count as number })
    }
  }
  return metrics
}

export default function ChatPage() {
  const router = useRouter()
  const [timestamps, setTimestamps] = useState<Map<string, Date>>(new Map())
  const scrollRef = useRef<HTMLDivElement>(null)
  const [userScrolledUp, setUserScrolledUp] = useState(false)
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | undefined>(undefined)
  const [hasMore, setHasMore] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [patientId, setPatientId] = useState<string | null>(null)

  // Stabilize transport identity across renders
  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat' }), [])

  const { messages, sendMessage, status, error, regenerate, setMessages } = useChat({
    transport,
    messages: initialMessages,
  })

  // Load message history from Supabase
  useEffect(() => {
    async function loadHistory() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        const { data: patient } = await supabase
          .from('patients')
          .select('id, consent_at, name, profile')
          .eq('auth_user_id', user.id)
          .single()

        if (!patient) {
          router.push('/onboarding')
          return
        }

        const profile = patient.profile as Record<string, unknown> | null
        if (!patient.consent_at || !patient.name || !profile?.injury) {
          router.push('/onboarding')
          return
        }

        setPatientId(patient.id)

        const { data: dbMessages, count } = await supabase
          .from('messages')
          .select('id, role, content, created_at', { count: 'exact' })
          .eq('patient_id', patient.id)
          .order('created_at', { ascending: false })
          .limit(MESSAGES_PER_PAGE)

        if (dbMessages && dbMessages.length > 0) {
          const newTs = new Map<string, Date>()
          const uiMessages: UIMessage[] = dbMessages.reverse().map(msg => {
            newTs.set(msg.id, new Date(msg.created_at))
            return {
              id: msg.id,
              role: msg.role as 'user' | 'assistant',
              parts: [{ type: 'text' as const, text: msg.content }],
            }
          })
          setTimestamps(newTs)
          setInitialMessages(uiMessages)
          setHasMore((count || 0) > MESSAGES_PER_PAGE)
        }
      } catch (err) {
        console.error('Failed to load history:', err)
      } finally {
        setLoadingHistory(false)
      }
    }
    loadHistory()
  }, [router])

  // Auto-scroll on new messages (unless user scrolled up)
  useEffect(() => {
    if (!userScrolledUp && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, userScrolledUp])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    setUserScrolledUp(!atBottom)
  }, [])

  const handleLoadMore = useCallback(async () => {
    if (!patientId || messages.length === 0 || loadingMore) return

    setLoadingMore(true)
    try {
      const supabase = createClient()
      const oldestTimestamp = timestamps.get(messages[0].id)
      if (!oldestTimestamp) return

      const { data: olderMessages, count } = await supabase
        .from('messages')
        .select('id, role, content, created_at', { count: 'exact' })
        .eq('patient_id', patientId)
        .lt('created_at', oldestTimestamp.toISOString())
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PER_PAGE)

      if (olderMessages && olderMessages.length > 0) {
        const uiMessages: UIMessage[] = olderMessages.reverse().map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          parts: [{ type: 'text' as const, text: msg.content }],
        }))
        setTimestamps(prev => {
          const next = new Map(prev)
          olderMessages.forEach(msg => next.set(msg.id, new Date(msg.created_at)))
          return next
        })
        setMessages(prev => [...uiMessages, ...prev])
        setHasMore((count || 0) > MESSAGES_PER_PAGE)
      }
    } finally {
      setLoadingMore(false)
    }
  }, [patientId, messages, setMessages, timestamps, loadingMore])

  const [input, setInput] = useState('')

  const isProcessing = status === 'submitted' || status === 'streaming'

  if (loadingHistory) {
    return (
      <div className="flex flex-col h-dvh items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading your conversation...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-dvh max-h-dvh">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-3 shrink-0">
        <h1 className="text-lg font-semibold text-primary">V-Health Recovery Coach</h1>
        <Button variant="ghost" size="icon" aria-label="Help">
          <HelpCircle className="h-5 w-5" />
        </Button>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        aria-live="polite"
      >
        {/* Load more button */}
        {hasMore && (
          <div className="flex justify-center pb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="text-xs"
            >
              {loadingMore ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <ChevronUp className="h-3 w-3 mr-1" />
              )}
              Load older messages
            </Button>
          </div>
        )}

        {messages.map((msg) => {
          const metrics = msg.role === 'assistant' ? extractMetricsFromParts(msg) : []
          const timestamp = timestamps.get(msg.id)

          return (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[85%] space-y-1">
                <Card
                  className={`px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  {msg.parts.map((part, index) =>
                    part.type === 'text' ? (
                      <p key={`${msg.id}-part-${index}`} className="text-sm leading-relaxed whitespace-pre-wrap">
                        {part.text}
                      </p>
                    ) : null,
                  )}
                </Card>
                {/* Metric badges */}
                {metrics.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-1">
                    {metrics.map((m, i) => (
                      <MetricBadge key={`${msg.id}-metric-${i}`} metric={m} />
                    ))}
                  </div>
                )}
                {/* Timestamp */}
                {timestamp && (
                  <p className="text-[10px] text-muted-foreground px-1">
                    {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>
          )
        })}

        {/* Typing indicator */}
        {status === 'submitted' && (
          <div className="flex justify-start">
            <Card className="bg-muted px-4 py-3 max-w-[85%]">
              <div className="flex gap-2">
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-3 w-3 rounded-full" />
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="border-t bg-destructive/5 px-4 py-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">Something went wrong. Try again.</p>
          <Button variant="outline" size="sm" onClick={() => regenerate()}>
            Retry
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="border-t px-4 py-3 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (input.trim() && !isProcessing) {
              sendMessage({ text: input.trim() })
              setInput('')
            }
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="h-12 text-base"
            autoComplete="off"
            disabled={isProcessing}
            maxLength={MAX_MESSAGE_LENGTH}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isProcessing}
            className="h-12 w-12 shrink-0"
            aria-label="Send message"
          >
            {isProcessing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <SendHorizontal className="h-5 w-5" />
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
