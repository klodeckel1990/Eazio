import type { FastifyInstance } from 'fastify'
import type { DB } from '../../db/client.js'
import { getPasswordHash, setUserPassword } from '../../modules/auth/users.repo.js'
import { verifyResetToken } from '../../modules/auth/password-reset.js'

// Login-freie Passwort-Reset-Seite (aus der Reset-Mail verlinkt). Server-
// gerendert mit klassischem Form-POST — kein JS nötig (CSP erlaubt kein
// Inline-Script, und die React-App wird nicht mehr ausgeliefert).

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${title} · Tellerwert</title>
<style>
  :root { color-scheme: light; } * { box-sizing: border-box; }
  body { margin:0; background:#F4F1EA; color:#2b2b28; font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .wrap { max-width:460px; margin:0 auto; padding:48px 22px 80px; }
  header { display:flex; align-items:center; gap:12px; margin-bottom:24px; }
  header img { width:40px; height:40px; border-radius:10px; }
  header .name { font-family:Georgia,serif; font-size:24px; font-weight:700; }
  h1 { font-family:Georgia,serif; font-size:26px; margin:0 0 12px; }
  p { color:#3a3833; } label { display:block; font-weight:600; margin:16px 0 6px; }
  input[type=password] { width:100%; padding:12px 14px; font-size:16px; border:1px solid #d9d3c6; border-radius:12px; background:#fff; }
  button { width:100%; margin-top:22px; padding:13px; font-size:16px; font-weight:600; color:#fff; background:#1f5640; border:none; border-radius:14px; cursor:pointer; }
  .err { background:#f7e1de; color:#c2473b; border-radius:12px; padding:12px 14px; font-size:14px; margin:8px 0; }
  .ok { background:#e2efe5; color:#1f5640; border-radius:12px; padding:14px 16px; }
  .muted { color:#7a766c; font-size:14px; }
</style></head>
<body><div class="wrap">
  <header><img src="/icon-192.png" alt=""><span class="name">Tellerwert</span></header>
  ${body}
</div></body></html>`
}

function formBody(token: string, error?: string): string {
  return page('Passwort zurücksetzen', `
    <h1>Neues Passwort</h1>
    <p>Wähle ein neues Passwort für dein Tellerwert-Konto (mindestens 8 Zeichen).</p>
    ${error ? `<p class="err">${error}</p>` : ''}
    <form method="post" action="/passwort-zuruecksetzen">
      <input type="hidden" name="token" value="${token}">
      <label for="p1">Neues Passwort</label>
      <input id="p1" type="password" name="password" minlength="8" autocomplete="new-password" required>
      <label for="p2">Passwort wiederholen</label>
      <input id="p2" type="password" name="password2" minlength="8" autocomplete="new-password" required>
      <button type="submit">Passwort setzen</button>
    </form>`)
}

const invalidPage = page('Link ungültig', `
  <h1>Link ungültig oder abgelaufen</h1>
  <p>Dieser Reset-Link funktioniert nicht mehr (er ist 30 Minuten gültig und nur einmal verwendbar).</p>
  <p class="muted">Fordere in der Tellerwert-App über „Passwort vergessen?" einen neuen Link an.</p>`)

const successPage = page('Erledigt', `
  <h1>Passwort geändert ✓</h1>
  <div class="ok">Du kannst dich jetzt in der Tellerwert-App mit deinem neuen Passwort anmelden.</div>`)

export function registerPasswordResetWebRoutes(app: FastifyInstance, db: DB): void {
  // klassische HTML-Formulare senden application/x-www-form-urlencoded — ohne
  // eigenen Parser käme der Body nicht an (Fastify parst standardmäßig nur JSON).
  if (!app.hasContentTypeParser('application/x-www-form-urlencoded')) {
    app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
      try {
        done(null, Object.fromEntries(new URLSearchParams(body as string)))
      } catch (err) {
        done(err as Error)
      }
    })
  }

  const lookup = (userId: string) => getPasswordHash(db, userId)

  app.get('/passwort-zuruecksetzen', async (req, reply) => {
    const token = (req.query as { token?: string })?.token ?? ''
    const ok = token && verifyResetToken(token, lookup) !== null
    return reply.type('text/html; charset=utf-8').send(ok ? formBody(token) : invalidPage)
  })

  app.post('/passwort-zuruecksetzen', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const b = (req.body ?? {}) as { token?: string; password?: string; password2?: string }
    const token = b.token ?? ''
    const userId = token ? verifyResetToken(token, lookup) : null
    if (!userId) return reply.type('text/html; charset=utf-8').send(invalidPage)
    const password = b.password ?? ''
    if (password.length < 8) {
      return reply.type('text/html; charset=utf-8').send(formBody(token, 'Mindestens 8 Zeichen.'))
    }
    if (password !== b.password2) {
      return reply.type('text/html; charset=utf-8').send(formBody(token, 'Die Passwörter stimmen nicht überein.'))
    }
    await setUserPassword(db, userId, password)
    return reply.type('text/html; charset=utf-8').send(successPage)
  })
}
