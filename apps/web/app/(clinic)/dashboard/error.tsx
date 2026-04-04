'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16 px-4 text-center">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Something went wrong</h2>
        <p className="text-muted-foreground max-w-sm">
          There was a problem loading this page. Please try again or contact V-Health support.
        </p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
