export function isWidgetEnabled(): boolean {
  const v = process.env.WIDGET_ENABLED
  if (v === undefined) return true
  return v.toLowerCase() === 'true'
}
