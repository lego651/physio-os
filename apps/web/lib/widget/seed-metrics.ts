// apps/web/lib/widget/seed-metrics.ts
// Deterministic pseudo-data for the April 30 demo — NEVER call this at runtime against production.
export interface SimMetrics {
  conversations: number; leads: number; topQuestions: Array<{ q: string; count: number }>
  therapistDistribution: Array<{ name: string; recommendations: number }>
  reviewsGenerated: number; reviewCompletion: number; hoursSaved: number
  dailySeries: Array<{ date: string; conversations: number; leads: number }>
}

export function generateSimMetrics(therapistNames: string[]): SimMetrics {
  const days = 30; const daily = []
  let convos = 0, leads = 0
  for (let i = 0; i < days; i++) {
    const d = new Date(); d.setDate(d.getDate() - (days - 1 - i))
    const c = Math.round(3 + i * 0.25 + Math.random() * 3)
    const l = Math.round(c * (0.12 + (i / days) * 0.1))
    daily.push({ date: d.toISOString().slice(0, 10), conversations: c, leads: l })
    convos += c; leads += l
  }
  const distribution = therapistNames.map((name, i) => ({
    name, recommendations: Math.max(1, Math.round((leads * (1 / therapistNames.length)) * (1 + (i % 3 - 1) * 0.2))),
  }))
  return {
    conversations: convos, leads,
    topQuestions: [
      { q: 'Do you accept my insurance?', count: 38 },
      { q: 'I have back pain, who should I see?', count: 31 },
      { q: 'What are your hours?', count: 27 },
      { q: 'How much does a massage cost?', count: 22 },
      { q: 'Do you do direct billing?', count: 19 },
    ],
    therapistDistribution: distribution,
    reviewsGenerated: 18, reviewCompletion: 0.72,
    hoursSaved: Math.round((convos * 4) / 60),
    dailySeries: daily,
  }
}
