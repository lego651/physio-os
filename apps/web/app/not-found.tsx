'use client'

import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted-foreground max-w-sm">
          We couldn&apos;t find the page you were looking for.
        </p>
      </div>
      <Link href="/chat" className={buttonVariants()}>
        Go to chat
      </Link>
    </div>
  )
}
