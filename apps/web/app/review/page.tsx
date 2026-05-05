import { ReviewAssistant } from './review-assistant'

export const metadata = {
  title: 'Leave a Review — V-Health',
}

export default function ReviewPage() {
  const isProd = process.env.VERCEL_ENV === 'production'

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold">Leave a Review</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell us about your visit in a word or two
          </p>
        </div>
        <ReviewAssistant isProd={isProd} />
      </div>
    </main>
  )
}
