# Push-Benachrichtigungen — Setup & Architektur

Zwei Erinnerungsarten (je Opt-in in den Einstellungen):

- **Abend-Erinnerung** (`reminderPush`/`reminderTime`): ein Push am Tag ab der
  eingestellten Uhrzeit, wenn das Tagebuch leer ist.
- **Mahlzeiten-Erinnerungen** (`mealReminders`): lernen pro Slot (Frühstück/
  Mittag/Abend) den Median der Track-Zeiten der letzten 28 Tage und erinnern
  45 min danach. Details in `server/src/modules/push/meal-reminders.ts`.

Zustellung plattformneutral über `modules/push/deliver.ts`:
iOS-Tokens → APNs, Android-Tokens → FCM. Tick: 60 s (`startReminderJob`).

## iOS (APNs) — eingerichtet seit 2026-06-12

- Key: `/data/AuthKey_2H4BX25VMB.p8` im Server-Volume (Original beim User)
- Env: `APNS_KEY_PATH`, `APNS_KEY_ID` (Team/Topic haben Defaults)
- Dev-Builds aus Xcode = Sandbox, TestFlight/App Store = Produktion —
  `sendWithFallback` probiert beide und merkt sich das Ergebnis pro Token
  (`push_tokens.apns_env`).

## Android (FCM) — Code fertig, Firebase-Setup ausstehend

Einmalig (User):

1. [console.firebase.google.com](https://console.firebase.google.com) →
   Projekt erstellen (z. B. „Tellerwert"; Google Analytics optional/aus).
2. **Android-App hinzufügen**: Paketname `de.tellerwert.app` →
   `google-services.json` herunterladen → nach
   `app/android/app/google-services.json` legen (gitignored lassen!).
3. **Service-Account-Key für den Server**: Projekteinstellungen →
   Dienstkonten → „Neuen privaten Schlüssel generieren" (JSON) →
   auf den Server ins Daten-Volume legen, Env setzen:
   `FCM_SERVICE_ACCOUNT_PATH=/data/fcm-service-account.json`
4. Danach: in `web/src/lib/push.ts` die `pushAvailable()`-Sperre auf
   `'ios'` entfernen (Schalter erscheinen dann auch auf Android) und neue
   Builds bauen.

Der Server-Versand (`modules/push/fcm.ts`) nutzt die FCM-HTTP-v1-API direkt
(Service-Account-JWT → Access-Token via jose, kein firebase-admin).

## Buchhaltung

- `push_tokens`: Geräte-Registry (`POST /api/push/register|unregister`),
  Token wandert beim Kontowechsel mit, Logout meldet ab.
- `push_reminders`: 1 Abend-Push pro Tag. `push_log`: 1 Mahlzeiten-Push pro
  Slot/Tag, max. 2/Tag; Abend-Push entfällt nach Mahlzeiten-Push.
