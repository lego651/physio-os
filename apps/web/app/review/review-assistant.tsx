'use client'

import { useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'

type Props = {
  isProd: boolean
}

export function ReviewAssistant({ isProd }: Props) {
  const [input, setInput] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [reviewUrl, setReviewUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    setIsLoading(true)
    setError(null)
    setDraft(null)
    setReviewUrl(null)
    setCopied(false)

    try {
      const res = await fetch('/api/review/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to generate review')
      }

      const body = await res.json()
      setDraft(body.draft)
      setReviewUrl(body.reviewUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleCopy() {
    if (!draft) return
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API can fail in non-secure contexts; fail silently.
    }
  }

  return (
    <div>
      {!isProd && (
        <div className="rounded-md bg-amber-100 border border-amber-300 px-3 py-2 text-xs text-amber-900 mb-4">
          TEST MODE — review will not be posted publicly
        </div>
      )}

      {!draft ? (
        <Card>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="e.g. great session, back feels much better"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={3}
              disabled={isLoading}
            />
            <Button
              onClick={handleGenerate}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? 'Generating…' : 'Generate Review'}
            </Button>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-muted px-3 py-3 text-sm whitespace-pre-wrap">
              {draft}
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={handleCopy} variant="outline" className="w-full">
                {copied ? 'Copied!' : 'Copy Review'}
              </Button>
              {reviewUrl && (
                <a
                  href={reviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants(), 'w-full')}
                >
                  Open Google Maps to paste your review
                </a>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(null)
                  setReviewUrl(null)
                  setInput('')
                  setError(null)
                }}
                className="w-full"
              >
                Start Over
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
