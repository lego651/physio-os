// apps/web/lib/review/templates/email.ts
//
// Variant C: dual-link email body mirroring SMS Variant C structure.
// Two CTA buttons: direct Google Maps + AI-assisted draft.
// Includes JG discount code and plain-text fallback.

export interface EmailSubjectInput {
  clinicName: string
  patientName: string
}

export function buildReviewEmailSubject(input: EmailSubjectInput): string {
  return `Help ${input.clinicName} grow — share your experience`
}

export interface EmailHtmlInput {
  clinicName: string
  senderName: string
  patientName: string
  /** Direct Google Maps review link: /r/gmap?t={jti} */
  gmapLink: string
  /** AI-assisted draft page: /r/ai?t={jti} */
  aiLink: string
  unsubscribeLink: string
}

export function buildReviewEmailHtml(input: EmailHtmlInput): string {
  const firstName = escapeHtml(input.patientName.split(/\s+/)[0] ?? 'there')
  return `<!doctype html>
<html lang="en">
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;color:#1a1a1a;max-width:560px;margin:0 auto;padding:32px 20px">

  <p style="font-size:18px;font-weight:600;margin:0 0 16px">Hi ${firstName} &#x1F44B;</p>

  <p style="margin:0 0 16px">
    Thanks for visiting <strong>${escapeHtml(input.clinicName)}</strong>.<br>
    As a small local clinic, your review on Google helps neighbors find us.
  </p>

  <table style="border-collapse:collapse;margin:24px 0 16px" role="presentation">
    <tr>
      <td>
        <a href="${input.gmapLink}"
           style="display:inline-block;background:#16a34a;color:#ffffff;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">
          Leave us a Google review
        </a>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 12px;font-size:14px;color:#374151">
    Even simpler: pick a few words about today's visit:
  </p>

  <table style="border-collapse:collapse;margin:0 0 24px" role="presentation">
    <tr>
      <td>
        <a href="${input.aiLink}"
           style="display:inline-block;background:#2563eb;color:#ffffff;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">
          We'll write it
        </a>
      </td>
    </tr>
  </table>

  <p style="margin:0 0 16px;font-size:14px;color:#374151">
    Thanks for your help! Use code <strong>JG</strong> for <strong>10% off</strong> your next visit.
  </p>

  <p style="color:#6b7280;font-size:13px;margin:0 0 8px">&mdash; ${escapeHtml(input.senderName)}</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">

  <p style="color:#9ca3af;font-size:12px;margin:0">
    You received this because you visited ${escapeHtml(input.clinicName)} recently.
    <a href="${input.unsubscribeLink}" style="color:#9ca3af">Unsubscribe</a>.
  </p>

</body>
</html>`
}

export interface EmailTextInput {
  clinicName: string
  senderName: string
  patientName: string
  gmapLink: string
  aiLink: string
  unsubscribeLink: string
}

export function buildReviewEmailText(input: EmailTextInput): string {
  const firstName = input.patientName.split(/\s+/)[0] ?? 'there'
  return [
    `Hi ${firstName},`,
    '',
    `Thanks for visiting ${input.clinicName}.`,
    `As a small local clinic, your review on Google helps neighbors find us.`,
    '',
    `Leave us a Google review:`,
    input.gmapLink,
    '',
    `Even simpler: pick a few words about today's visit:`,
    `We'll write it for you:`,
    input.aiLink,
    '',
    `Thanks for your help! Use code JG for 10% off your next visit.`,
    '',
    `— ${input.senderName}`,
    '',
    `Unsubscribe: ${input.unsubscribeLink}`,
  ].join('\n')
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}
