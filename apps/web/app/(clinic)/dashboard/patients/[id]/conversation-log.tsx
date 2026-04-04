'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageSquare } from 'lucide-react'

interface Message {
  id: string
  role: string
  content: string
  channel: string
  media_urls: string[] | null
  created_at: string
}

const PAGE_SIZE = 50

export function ConversationLog({ patientId }: { patientId: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [channelFilter, setChannelFilter] = useState<'all' | 'sms' | 'web'>('all')

  const fetchMessages = useCallback(async (currentOffset: number, append: boolean) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(currentOffset),
      })
      if (channelFilter !== 'all') params.set('channel', channelFilter)

      const res = await fetch(`/api/admin/patients/${patientId}/messages?${params}`)
      if (!res.ok) throw new Error('Failed to fetch messages')
      const data = await res.json() as { messages: Message[]; total: number }

      if (append) {
        setMessages((prev) => [...prev, ...data.messages])
      } else {
        setMessages(data.messages)
      }
      setHasMore(currentOffset + PAGE_SIZE < data.total)
    } catch (err) {
      console.error('Failed to load messages:', err)
    } finally {
      setLoading(false)
    }
  }, [patientId, channelFilter])

  useEffect(() => {
    setOffset(0)
    fetchMessages(0, false)
  }, [fetchMessages])

  const loadMore = () => {
    const newOffset = offset + PAGE_SIZE
    setOffset(newOffset)
    fetchMessages(newOffset, true)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            Conversation Log
          </CardTitle>
          <div className="flex gap-1">
            {(['all', 'sms', 'web'] as const).map((ch) => (
              <Button
                key={ch}
                variant={channelFilter === ch ? 'default' : 'ghost'}
                size="sm"
                className="min-h-[44px] min-w-[44px]"
                onClick={() => setChannelFilter(ch)}
                aria-label={`Filter messages: ${ch === 'all' ? 'all channels' : ch.toUpperCase()}`}
              >
                {ch === 'all' ? 'All' : ch.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {messages.length === 0 && !loading ? (
          <p className="py-8 text-center text-muted-foreground">No conversations yet</p>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}

        {loading && (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading...</p>
        )}

        {hasMore && !loading && (
          <div className="mt-4 flex justify-center">
            <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={loadMore}>
              Load older messages
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isAssistant = message.role === 'assistant'

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {isAssistant ? 'Coach' : 'Patient'}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {message.channel.toUpperCase()}
        </Badge>
      </div>
      <div
        className={`rounded-lg px-3 py-2 text-sm ${
          isAssistant
            ? 'bg-muted'
            : 'bg-primary/10'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.media_urls && message.media_urls.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.media_urls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Attachment ${i + 1}`}
                className="max-h-48 rounded border object-cover"
                loading="lazy"
                onError={(e) => {
                  const img = e.currentTarget
                  img.style.display = 'none'
                  const placeholder = document.createElement('div')
                  placeholder.className = 'flex h-24 w-32 items-center justify-center rounded border bg-muted text-xs text-muted-foreground'
                  placeholder.textContent = 'Image unavailable'
                  img.parentElement?.replaceChild(placeholder, img)
                }}
              />
            ))}
          </div>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground">
        {new Date(message.created_at).toLocaleString()}
      </span>
    </div>
  )
}
