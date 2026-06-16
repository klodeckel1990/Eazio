import type { FastifyInstance } from 'fastify'

// Standalone, login-freie Rechtsseiten unter tellerwert.de/datenschutz und
// /impressum — als URL in App Store Connect / Play Console hinterlegbar und für
// Apples Crawler ohne App-Shell erreichbar. Inline-CSS (CSP erlaubt
// style-src 'unsafe-inline'); kein JS nötig.

const STAND = 'Juni 2026'

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · Tellerwert</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #F4F1EA; color: #2b2b28;
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 40px 22px 80px; }
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
  header img { width: 40px; height: 40px; border-radius: 10px; }
  header .name { font-family: Georgia, "Times New Roman", serif; font-size: 26px; font-weight: 700; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-size: 30px; margin: 0 0 6px; }
  h2 { font-family: Georgia, "Times New Roman", serif; font-size: 20px; margin: 34px 0 8px; }
  .stand { color: #7a766c; font-size: 14px; margin: 0 0 8px; }
  p, li { color: #3a3833; }
  a { color: #b6552f; }
  ul { padding-left: 20px; }
  .note { background: #ece7db; border-radius: 12px; padding: 14px 16px; font-size: 14px; color: #5f5b51; }
  footer { margin-top: 48px; font-size: 13px; color: #8a867c; }
  footer a { color: #8a867c; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <img src="/icon-192.png" alt="">
      <span class="name">Tellerwert</span>
    </header>
    <h1>${title}</h1>
    <p class="stand">Stand: ${STAND}</p>
    ${body}
    <footer>
      <a href="/datenschutz">Datenschutz</a> · <a href="/impressum">Impressum</a>
    </footer>
  </div>
</body>
</html>`
}

const IMPRESSUM = `
<h2>Angaben gemäß § 5 DDG</h2>
<p>
  [VERANTWORTLICHER_NAME]<br>
  [STRASSE_NR]<br>
  [PLZ_ORT]<br>
  Deutschland
</p>
<h2>Kontakt</h2>
<p>
  E-Mail: <a href="mailto:[KONTAKT_EMAIL]">[KONTAKT_EMAIL]</a><br>
  Telefon: [TELEFON_OPTIONAL]
</p>
<h2>Umsatzsteuer-ID</h2>
<p>[UST_ID_ODER_ENTFERNEN]</p>
<h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
<p>[VERANTWORTLICHER_NAME], Anschrift wie oben.</p>
`

const DATENSCHUTZ = `
<p>Diese Erklärung informiert über die Verarbeitung personenbezogener Daten bei der
Nutzung der App und der Website <strong>Tellerwert</strong> (ein Ernährungs- und
Kalorientagebuch).</p>

<h2>1. Verantwortlicher</h2>
<p>
  [VERANTWORTLICHER_NAME]<br>
  [STRASSE_NR], [PLZ_ORT], Deutschland<br>
  E-Mail: <a href="mailto:[KONTAKT_EMAIL]">[KONTAKT_EMAIL]</a>
</p>

<h2>2. Hosting</h2>
<p>Tellerwert wird auf einem Server in Deutschland betrieben. Es werden keine Daten an
ein externes Cloud-Hosting weitergegeben; eine Verarbeitung findet ausschließlich im
Rahmen der unten genannten Dienste statt.</p>

<h2>3. Konto &amp; Anmeldung</h2>
<p>Für die Nutzung legst du ein Konto an. Verarbeitet werden Benutzername, optional eine
E-Mail-Adresse sowie ein <em>Hash</em> deines Passworts (das Passwort selbst wird nie
gespeichert). Alternativ kannst du dich über <strong>Sign in with Google</strong> oder
<strong>Sign in with Apple</strong> anmelden; dabei erhalten wir eine pseudonyme
Kennung und ggf. deine E-Mail-Adresse vom jeweiligen Anbieter.
Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).</p>

<h2>4. Tagebuch- &amp; Ernährungsdaten</h2>
<p>Deine Einträge (Mahlzeiten, Lebensmittel, Mengen, Wasser, Ziele) speichern wir, um die
Tagebuch-Funktion bereitzustellen. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</p>

<h2>5. Gesundheits- &amp; Fitnessdaten (optional)</h2>
<p>Wenn du es in den Einstellungen aktivierst, liest die App Schritte, Aktivitätskalorien
und Gewicht aus Apple Health bzw. Android Health Connect und überträgt sie an unseren
Server, um sie im Tagebuch anzuzeigen. Dabei handelt es sich um Gesundheitsdaten
(besondere Kategorie). Rechtsgrundlage ist deine <strong>ausdrückliche Einwilligung</strong>
(Art. 9 Abs. 2 lit. a DSGVO), die du jederzeit durch Deaktivieren widerrufen kannst.
Diese Daten werden nicht für Werbung verwendet und nicht an Dritte weitergegeben.</p>

<h2>6. Push-Benachrichtigungen (optional)</h2>
<p>Aktivierst du Erinnerungen, speichern wir ein Geräte-Token und versenden Push-Nachrichten
über Apple Push Notification service (APNs, Apple Inc.) bzw. Google Firebase Cloud
Messaging (FCM, Google Ireland Ltd. / Google LLC). Rechtsgrundlage: Art. 6 Abs. 1 lit. a
DSGVO (Einwilligung).</p>

<h2>7. Rezept-Import</h2>
<p>Beim Import eines Rezepts aus einem Link oder Text wird der betreffende Inhalt zur
strukturierten Auswertung an <strong>Anthropic, PBC</strong> (USA) übermittelt. Bei
Instagram-Links wird die Beitragsbeschreibung über <strong>Apify Technologies s.r.o.</strong>
(Tschechien) abgerufen. Diese Verarbeitung erfolgt nur, wenn du einen Import auslöst.
Rechtsgrundlage: Art. 6 Abs. 1 lit. b bzw. f DSGVO.</p>

<h2>8. Yazio-Verknüpfung (optional)</h2>
<p>Verknüpfst du freiwillig ein Yazio-Konto, werden die dafür nötigen Zugangsdaten
verschlüsselt gespeichert und Einträge mit deinem Yazio-Konto (YAZIO GmbH, Deutschland)
abgeglichen. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</p>

<h2>9. Übermittlung in Drittländer</h2>
<p>Einzelne Dienste (Anthropic, ggf. Apple/Google) verarbeiten Daten in den USA. Die
Übermittlung erfolgt auf Grundlage der EU-Standardvertragsklauseln bzw. des EU-US Data
Privacy Frameworks.</p>

<h2>10. Speicherdauer &amp; Löschung</h2>
<p>Wir speichern deine Daten, solange dein Konto besteht. Du kannst dein Konto jederzeit
<strong>direkt in der App löschen</strong> (Einstellungen → Konto löschen). Dabei werden
dein Konto und alle zugehörigen Daten unwiderruflich entfernt.</p>

<h2>11. Deine Rechte</h2>
<p>Dir stehen die Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung der
Verarbeitung, Datenübertragbarkeit und Widerspruch zu. Erteilte Einwilligungen kannst du
jederzeit mit Wirkung für die Zukunft widerrufen. Wende dich dafür an
<a href="mailto:[KONTAKT_EMAIL]">[KONTAKT_EMAIL]</a>. Außerdem hast du das Recht, dich bei
einer Datenschutz-Aufsichtsbehörde zu beschweren.</p>

<h2>12. Änderungen</h2>
<p>Wir passen diese Datenschutzerklärung an, wenn sich die App oder die Rechtslage ändert.
Es gilt die jeweils hier veröffentlichte Fassung.</p>
`

export function registerLegalRoutes(app: FastifyInstance): void {
  app.get('/datenschutz', async (_req, reply) => {
    return reply.type('text/html; charset=utf-8').send(page('Datenschutzerklärung', DATENSCHUTZ))
  })
  app.get('/impressum', async (_req, reply) => {
    return reply.type('text/html; charset=utf-8').send(page('Impressum', IMPRESSUM))
  })
}
