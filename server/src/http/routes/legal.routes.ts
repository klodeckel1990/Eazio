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
      <a href="/datenschutz">Datenschutz</a> · <a href="/impressum">Impressum</a> · <a href="/nutzungsbedingungen">Nutzungsbedingungen</a>
    </footer>
  </div>
</body>
</html>`
}

const NUTZUNG = `
<p>Diese Bedingungen regeln die Nutzung der App und Website <strong>Tellerwert</strong>
(Ernährungs- und Kalorientagebuch), angeboten von Jens Gossen, Billrothstr. 18,
45147 Essen (siehe <a href="/impressum">Impressum</a>).</p>

<h2>1. Leistung</h2>
<p>Tellerwert stellt Funktionen zum Tracken von Mahlzeiten, Nährwerten und Aktivität
bereit. Ein Teil der Funktionen ist kostenlos; erweiterte Funktionen sind dem
kostenpflichtigen Abo „Tellerwert Premium" vorbehalten.</p>

<h2>2. Tellerwert Premium (Abo)</h2>
<ul>
  <li>Premium ist als <strong>automatisch verlängerndes Abo</strong> erhältlich:
      <strong>1,99 €/Monat</strong> oder <strong>19,99 €/Jahr</strong> (inkl. USt.).</li>
  <li>Der Kauf und die Abrechnung erfolgen über deinen <strong>Apple-App-Store-</strong>
      bzw. <strong>Google-Play-Account</strong>. Die Zahlung wird mit Kaufbestätigung fällig.</li>
  <li>Das Abo <strong>verlängert sich automatisch</strong> um die gewählte Laufzeit, sofern
      es nicht mindestens 24 Stunden vor Ablauf gekündigt wird. Die Verlängerung wird
      innerhalb von 24 Stunden vor Ablauf berechnet.</li>
  <li><strong>Kündigung & Verwaltung</strong> jederzeit in den Abo-Einstellungen deines
      App-Store-/Play-Store-Accounts. Eine angefangene Periode wird nicht anteilig erstattet.</li>
  <li>Ein eventuelles Gratis-Testangebot endet automatisch; bei nicht rechtzeitiger
      Kündigung geht es in das kostenpflichtige Abo über.</li>
</ul>

<h2>3. Widerruf</h2>
<p>Für digitale Inhalte gilt das gesetzliche Widerrufsrecht; mit dem Start der
Abo-Leistung kann es erlöschen. Rückerstattungen wickelt der jewerige Store
(Apple/Google) nach dessen Richtlinien ab.</p>

<h2>4. Pflichten der Nutzer</h2>
<p>Die App ersetzt keine medizinische oder ernährungswissenschaftliche Beratung.
Nährwert- und KI-Schätzungen (z. B. aus Fotos oder Importen) können fehlerhaft sein und
sind vor dem Verlassen auf sie zu prüfen.</p>

<h2>5. Haftung</h2>
<p>Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie nach dem
Produkthaftungsgesetz; im Übrigen nur bei Verletzung wesentlicher Vertragspflichten und
begrenzt auf den vertragstypisch vorhersehbaren Schaden.</p>

<h2>6. Änderungen & Recht</h2>
<p>Wir können diese Bedingungen anpassen, wenn sich die App oder die Rechtslage ändert;
es gilt die hier veröffentlichte Fassung. Es gilt deutsches Recht.</p>
`

const IMPRESSUM = `
<h2>Angaben gemäß § 5 DDG</h2>
<p>
  Jens Gossen<br>
  Billrothstr. 18<br>
  45147 Essen<br>
  Deutschland
</p>
<h2>Kontakt</h2>
<p>
  E-Mail: <a href="mailto:webmaster@tellerwert.de">webmaster@tellerwert.de</a><br>
  Telefon: +49 151 40222988
</p>
<h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
<p>Jens Gossen, Anschrift wie oben.</p>
`

const DATENSCHUTZ = `
<p>Diese Erklärung informiert über die Verarbeitung personenbezogener Daten bei der
Nutzung der App und der Website <strong>Tellerwert</strong> (ein Ernährungs- und
Kalorientagebuch).</p>

<h2>1. Verantwortlicher</h2>
<p>
  Jens Gossen<br>
  Billrothstr. 18, 45147 Essen, Deutschland<br>
  E-Mail: <a href="mailto:webmaster@tellerwert.de">webmaster@tellerwert.de</a>
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

<h2>5. Gesundheits- &amp; Fitnessdaten – Apple Health / Health Connect (optional)</h2>
<p>Nur wenn du es in den Einstellungen <strong>ausdrücklich aktivierst</strong>, verbindet sich
die App mit <strong>Apple Health</strong> (iOS) bzw. <strong>Health Connect</strong> (Android)
und verarbeitet die folgenden Gesundheits- und Fitnessdaten:</p>
<ul>
  <li><strong>Lesen:</strong> Schritte, Aktivitätskalorien (Aktivenergie) und Körpergewicht –
      um sie in deinem Tagebuch anzuzeigen und in die Tages- und Zielberechnung einzubeziehen.</li>
  <li><strong>Zurückschreiben:</strong> die von dir erfassten Tageswerte für Energie (kcal),
      Eiweiß, Fett, Kohlenhydrate und Wasser – damit deine Ernährung auch in Apple Health bzw.
      Health Connect sichtbar ist.</li>
</ul>
<p>Die aus Apple Health bzw. Health Connect <em>gelesenen</em> Werte werden an unseren Server in
Deutschland übertragen, um sie im Tagebuch darzustellen. Es handelt sich um Gesundheitsdaten
(besondere Kategorie personenbezogener Daten). Rechtsgrundlage ist deine
<strong>ausdrückliche Einwilligung</strong> (Art. 9 Abs. 2 lit. a DSGVO), die du jederzeit
durch Deaktivieren in den App-Einstellungen oder durch Entzug der Berechtigung in Apple Health
bzw. Health Connect mit Wirkung für die Zukunft widerrufen kannst.</p>
<p>Diese Daten werden <strong>ausschließlich</strong> für die genannten Tagebuch-Funktionen
verwendet. Sie werden <strong>nicht für Werbung</strong> genutzt, <strong>nicht verkauft</strong>
und <strong>nicht an Dritte weitergegeben</strong>; eine Verarbeitung zu anderen Zwecken findet
nicht statt. Über Health Connect bezogene Daten behandeln wir im Einklang mit den
Health-Connect-Richtlinien von Google. Bei einer Kontolöschung werden die auf unserem Server
gespeicherten Gesundheitswerte mit gelöscht.</p>

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
<a href="mailto:webmaster@tellerwert.de">webmaster@tellerwert.de</a>. Außerdem hast du das Recht, dich bei
einer Datenschutz-Aufsichtsbehörde zu beschweren.</p>

<h2>12. Änderungen</h2>
<p>Wir passen diese Datenschutzerklärung an, wenn sich die App oder die Rechtslage ändert.
Es gilt die jeweils hier veröffentlichte Fassung.</p>
`

// Öffentliche Konto-Lösch-Anleitung — von Apple wie Google Play (Data-Safety:
// „Konto-URL löschen") verlangt: erreichbar ohne Login, beschreibt die Schritte
// sowie die gelöschten/aufbewahrten Datentypen. Die eigentliche Löschung läuft
// in der App über Einstellungen → „Konto löschen" (DELETE /api/auth/me).
const KONTO_LOESCHEN = `
<p>Du kannst dein <strong>Tellerwert</strong>-Konto und alle zugehörigen Daten
jederzeit selbst löschen. Die Löschung ist sofort wirksam und unwiderruflich.</p>

<h2>In der App löschen (empfohlen)</h2>
<ol>
  <li>Öffne Tellerwert und melde dich an.</li>
  <li>Tippe unten in der Navigation auf <strong>Einstellungen</strong>.</li>
  <li>Scrolle nach unten zum Bereich <strong>„Konto löschen"</strong>.</li>
  <li>Tippe auf <strong>„Konto löschen"</strong> und bestätige mit
      <strong>„Ja, endgültig löschen"</strong>.</li>
</ol>
<p>Dein Konto wird daraufhin sofort entfernt und du wirst abgemeldet.</p>

<h2>Per E-Mail anfragen</h2>
<p>Falls du keinen Zugriff mehr auf die App hast, schreib uns an
<a href="mailto:webmaster@tellerwert.de?subject=Konto%20l%C3%B6schen">webmaster@tellerwert.de</a>
mit dem Betreff „Konto löschen" und nenne den in der App verwendeten Benutzernamen
bzw. die E-Mail-Adresse. Wir löschen das Konto dann innerhalb von 30 Tagen und
bestätigen dir die Löschung.</p>

<h2>Welche Daten gelöscht werden</h2>
<p>Mit dem Konto werden alle zugehörigen personenbezogenen Daten unwiderruflich entfernt:</p>
<ul>
  <li>Konto- und Profildaten (Benutzername, E-Mail-Adresse, Anmelde-/Login-Daten, Sitzungen)</li>
  <li>Tagebuch- und Wasser-Einträge, Ziele und Statistiken</li>
  <li>gespeicherte Rezepte, Presets und Lebensmittel-Zuordnungen</li>
  <li>verknüpfte Yazio-Konten und deren Zugangsdaten</li>
  <li>Push-Token und Erinnerungseinstellungen</li>
  <li>Abo-/Premium-Status in unserer Datenbank</li>
</ul>

<h2>Aufbewahrung</h2>
<p>Dein Konto und sämtliche oben genannten Daten werden sofort und dauerhaft
gelöscht. Eine darüber hinausgehende Aufbewahrung findet nicht statt; etwaige
technische Sicherungskopien werden im regulären Backup-Zyklus (spätestens nach
30 Tagen) überschrieben.</p>
<p class="note">Kauf- und Abodaten, die Apple (App Store) bzw. Google (Google Play)
im Rahmen deines Kaufs verwalten, liegen bei diesen Anbietern und unterliegen
deren Richtlinien. Ein laufendes Abo kündigst du in den Einstellungen des
jeweiligen App-Stores.</p>
`

export function registerLegalRoutes(app: FastifyInstance): void {
  app.get('/datenschutz', async (_req, reply) => {
    return reply.type('text/html; charset=utf-8').send(page('Datenschutzerklärung', DATENSCHUTZ))
  })
  app.get('/impressum', async (_req, reply) => {
    return reply.type('text/html; charset=utf-8').send(page('Impressum', IMPRESSUM))
  })
  app.get('/nutzungsbedingungen', async (_req, reply) => {
    return reply.type('text/html; charset=utf-8').send(page('Nutzungsbedingungen', NUTZUNG))
  })
  app.get('/konto-loeschen', async (_req, reply) => {
    return reply.type('text/html; charset=utf-8').send(page('Konto und Daten löschen', KONTO_LOESCHEN))
  })
}
