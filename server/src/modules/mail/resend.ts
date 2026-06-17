import { env } from '../../config/env.js'

export interface Mail {
  to: string
  subject: string
  html: string
  text?: string
}

/** Verschickt eine Mail über Resend. Ohne RESEND_API_KEY ein No-Op (false) —
 *  so booten Dev/Tests ohne Mail-Setup, und die forgot-Route bleibt sicher. */
export async function sendMail(m: Mail): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
  })
  return r.ok
}
