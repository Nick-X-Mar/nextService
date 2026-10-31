/**
 * Minimal HTML wrapper used by every email template. Keep it simple — most
 * mail clients strip CSS aggressively. The look matches the orange brand.
 *
 * The card is fluid up to 560px: most recipients read on a phone, where a
 * fixed 560px table was scaled down to fit.
 *
 * infra/lambdas/new-request-broadcast and appointment-completion-sweeper carry
 * a copy of this function. Change one, change the others.
 */
export function baseLayout({
  title,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  noteHtml = ''
}: {
  title: string
  bodyHtml: string
  ctaLabel?: string
  ctaUrl?: string
  noteHtml?: string
}): string {
  const cta = ctaLabel && ctaUrl
    ? `<p style="margin:32px 0 0 0;text-align:center;">
         <a href="${ctaUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-family:Arial,sans-serif;font-size:16px;">${ctaLabel}</a>
       </p>`
    : ''

  return `<!DOCTYPE html>
<html lang="el">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#f97316;padding:24px 28px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-family:Arial,sans-serif;">NextService</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:15px;line-height:1.6;color:#1f2937;">
              ${bodyHtml}
              ${cta}
              ${noteHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;background:#fafafa;font-size:12px;color:#6b7280;text-align:center;">
              Έλαβες αυτό το email επειδή χρησιμοποιείς το NextService.<br>
              © NextService — Η αγορά συνεργείων αυτοκινήτου.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
