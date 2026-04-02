'use client'

import { useState, useRef, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SendHorizontal, HelpCircle } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const mockMessages: Message[] = [
  {
    id: '1',
    role: 'assistant',
    content:
      "Hi! I'm your V-Health Recovery Coach. I'm here to help you track your recovery progress and stay on top of your exercises. How are you feeling today?",
  },
  { id: '2', role: 'user', content: 'Morning! My back is a bit stiff, discomfort about 2.' },
  {
    id: '3',
    role: 'assistant',
    content:
      "Got it — I've logged discomfort at 2 for today. That's down from your average of 2.3 this week. Did you get a chance to do your exercises?",
  },
]

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(mockMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)
    // AI integration comes in Sprint 2
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Thanks for sharing! (AI responses will be connected in Sprint 2)',
        },
      ])
      setLoading(false)
    }, 1000)
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <Card
              className={`max-w-[85%] px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            </Card>
          </div>
        ))}
        {loading && (
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

      {/* Input */}
      <div className="border-t px-4 py-3 shrink-0">
        <form onSubmit={handleSend} className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="h-12 text-base"
            autoComplete="off"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || loading}
            className="h-12 w-12 shrink-0"
            aria-label="Send message"
          >
            <SendHorizontal className="h-5 w-5" />
          </Button>
        </form>
      </div>
    </div>
  )
}
