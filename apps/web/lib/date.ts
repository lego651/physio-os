/**
 * Returns the Monday 00:00:00 UTC that starts the week containing the given date.
 * ISO weeks: Monday = start of week.
 */
export function getWeekStartUTC(from: Date): Date {
  const d = new Date(from)
  const dayOfWeek = d.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7
  d.setUTCDate(d.getUTCDate() - daysSinceMonday)
  d.setUTCHours(0, 0, 0, 0)
  return d
}
