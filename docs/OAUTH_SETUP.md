# Social Sign-In (Google & Apple) — Einrichtung

Der Code ist vollständig verdrahtet; was fehlt, sind die Client-IDs aus den
Entwickler-Konsolen. Ohne Konfiguration verhalten sich die Clients defensiv:

- **Apple auf iOS** funktioniert sofort, sobald die App mit der
  "Sign in with Apple"-Capability signiert ist (kein Server-Setup nötig —
  Audience ist die Bundle-ID `de.tellerwert.app`).
- **Google** (alle Plattformen) und **Apple im Web** bleiben unsichtbar, bis
  die jeweiligen IDs als Server-Env gesetzt sind. Die Buttons erscheinen
  automatisch, sobald `GET /api/auth/oauth/config` sie meldet — kein
  App-Rebuild nötig (außer für die iOS-URL-Scheme-Zeile, s. u.).

## Architektur

```
Client (nativ/Web) ── Provider-Dialog ──► ID-Token (JWT)
       │
       └─► POST /api/auth/oauth/{google|apple} { idToken, name?, platform }
                Server verifiziert Signatur (JWKS), Issuer, Audience, Ablauf
                ├─ bekannte Identität (provider, sub)        → Login
                ├─ verifizierte E-Mail matcht bestehendes Konto → verknüpfen
                └─ sonst neues Konto (ohne Passwort)          → Login
                Antwort: { id, username, token } — normale Bearer-Session
```

- Identitäten liegen in `auth_identities` (Migration 0013); ein Konto kann
  Passwort **und** mehrere Provider haben.
- Social-only-Konten haben `password_hash = ''` — Passwort-Login schlägt für
  sie immer fehl (Timing-konstant über den Dummy-Hash).
- Es gibt keine Client-Secrets: die IDs sind öffentlich und dienen
  serverseitig nur als Audience-Allowlist.

## 1. Apple (iOS — nativ)

1. [developer.apple.com](https://developer.apple.com/account) → Identifiers →
   App-ID `de.tellerwert.app` → Capability **Sign in with Apple** aktivieren
   (auch wenn Xcode "Automatically manage signing" nutzt: einmal anhaken).
2. Fertig. Das Entitlement (`com.apple.developer.applesignin`) ist bereits in
   `app/ios/App/App/App.entitlements` eingetragen, der Server akzeptiert die
   Bundle-ID als Audience (`APPLE_APP_CLIENT_ID`, Default `de.tellerwert.app`).

> App-Store-Hinweis: Sobald Google-Login in der iOS-App angeboten wird, ist
> Sign in with Apple Pflicht (Review-Guideline 4.8) — deshalb beide zusammen.

## 2. Google (iOS + Android + Web)

In der [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
(eigenes Projekt, z. B. "Tellerwert") unter **APIs & Services → Credentials**
drei OAuth-Client-IDs anlegen (vorher einmalig den OAuth-Consent-Screen
ausfüllen, Publishing-Status "In production"):

| Typ | Einstellungen | landet in |
|---|---|---|
| **Web application** | Authorized JavaScript origins: `https://tellerwert.de` | `GOOGLE_WEB_CLIENT_ID` (Server-Env) |
| **iOS** | Bundle ID: `de.tellerwert.app` | `GOOGLE_IOS_CLIENT_ID` (Server-Env) + URL-Scheme (s. u.) |
| **Android** | Package: `de.tellerwert.app` + SHA-1 des Signing-Keys¹ | nur in der Console — kein Env nötig |

¹ Debug-Key: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep SHA1`.
Für den Release-Build zusätzlich einen Android-Client mit dem Release-SHA-1
anlegen. Android sendet im ID-Token trotzdem die **Web**-Client-ID als
Audience — deshalb braucht der Server nur Web- und iOS-ID.

**iOS-URL-Scheme:** In `app/ios/App/App/Info.plist` den Platzhalter
`com.googleusercontent.apps.REPLACE-WITH-IOS-CLIENT-ID` durch die umgekehrte
iOS-Client-ID ersetzen (Console zeigt sie als "iOS URL scheme"), danach
`npm run build:app` und neu installieren.

## 3. Apple (Web — optional)

Nur nötig, wenn der Apple-Button auch im Browser erscheinen soll:

1. developer.apple.com → Identifiers → neue **Services ID** anlegen
   (z. B. `de.tellerwert.web`), "Sign in with Apple" aktivieren.
2. Dort als Domain `tellerwert.de` und als Return URL
   `https://tellerwert.de/login` registrieren (Domain-Verifikation per
   Apple-Datei durchführen).
3. `APPLE_WEB_CLIENT_ID=de.tellerwert.web` als Server-Env setzen.

## 4. Server-Env (Produktion)

In der `.env` auf dem Server (`root@ssh.jensgossen.de`) ergänzen und den
Container neu starten:

```env
GOOGLE_WEB_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID=1234567890-def.apps.googleusercontent.com
# optional, Default de.tellerwert.app:
# APPLE_APP_CLIENT_ID=de.tellerwert.app
# nur für Apple-Login im Browser:
# APPLE_WEB_CLIENT_ID=de.tellerwert.web
```

## Endpoints

- `GET /api/auth/oauth/config` — öffentlich; welche Provider aktiv sind
  (steuert die Buttons in Login/Registrierung).
- `POST /api/auth/oauth/google` / `POST /api/auth/oauth/apple` —
  `{ idToken, name?, deviceName?, platform? }` → `{ id, username, token }`.
  Fehler: `401 invalid_token`, `503 provider_not_configured`.

## Offene Punkte / bewusste Entscheidungen

- **Apple auf Android** ist ausgespart (bräuchte den Web-Flow mit
  Redirect-Roundtrip über den Server); Google deckt Android ab.
- Kein Nonce-Flow: Schutz beruht auf Signatur + Audience + kurzer
  Token-Lebensdauer (Apple ~10 min, Google ~1 h) und TLS.
- Der Anzeigename von Apple kommt nur bei der **allerersten** Autorisierung —
  der Client reicht ihn als `name` mit; daraus wird der Benutzername erzeugt.
