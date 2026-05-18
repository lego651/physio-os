// apps/web/app/review/[token]/unsubscribed/page.tsx

export default function UnsubscribedPage() {
  return (
    <main
      style={{
        maxWidth: 540,
        margin: '0 auto',
        padding: '40px 20px',
        fontFamily: '-apple-system,system-ui,sans-serif',
        color: '#1a1a1a',
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>You&apos;re unsubscribed</h1>
      <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
        We won&apos;t send you any more review requests. If you ever change your mind, just let the
        clinic know.
      </p>
    </main>
  )
}
