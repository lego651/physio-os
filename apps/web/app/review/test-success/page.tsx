export const metadata = {
  title: 'Test Mode — Review Submitted',
}

export default function ReviewTestSuccessPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md text-center">
        <div className="rounded-md bg-amber-100 border border-amber-300 px-4 py-3 text-sm text-amber-900 mb-6">
          TEST MODE — no real Google review was posted
        </div>
        <h1 className="text-2xl font-semibold mb-3">Would have opened Google Maps</h1>
        <p className="text-sm text-muted-foreground mb-6">
          In production, this link points to V-Health&apos;s Google Maps review page so the patient can paste their AI-drafted review. In dev/preview environments, it points here instead — to prevent fake reviews on the real listing.
        </p>
        <a
          href="/review"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          ← Back to /review
        </a>
      </div>
    </main>
  )
}
