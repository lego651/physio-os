// apps/web/lib/review/templates/email.ts

export interface EmailSubjectInput {
  clinicName: string
  patientName: string
}

export function buildReviewEmailSubject(input: EmailSubjectInput): string {
  return `${input.clinicName} — quick favour, 30 seconds`
}

export interface EmailHtmlInput {
  clinicName: string
  senderName: string
  patientName: string
  shortLink: string
  unsubscribeLink: string
}

export function buildReviewEmailHtml(input: EmailHtmlInput): string {
  return `<!doctype html>
<html><body style="font-family:-apple-system,system-ui,sans-serif;line-height:1.5;color:#1a1a1a">
<p>Hi ${escapeHtml(input.patientName)},</p>
<p>Thanks for visiting <strong>${escapeHtml(input.clinicName)}</strong>. Would you mind sharing a quick Google review? It takes about 30 seconds — we even drafted one for you.</p>
<p style="margin:32px 0">
  <a href="${input.shortLink}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Write my review</a>
</p>
<p style="color:#6b7280;font-size:13px">— ${escapeHtml(input.senderName)}</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0">
<p style="color:#6b7280;font-size:12px">
  You received this because you visited ${escapeHtml(input.clinicName)} recently.
  <a href="${input.unsubscribeLink}" style="color:#6b7280">Unsubscribe</a>.
</p>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!))
}
