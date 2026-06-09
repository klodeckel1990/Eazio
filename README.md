# 🥗 eazio

**Dein entspannter, selbst-gehosteter Begleiter für [Yazio](https://www.yazio.com/).**
Mahlzeiten in Sekunden tracken, Rezepte aus Social Media & Blogs importieren und Einkaufslisten erstellen – mobile-first, warm und ohne Schnickschnack.

> Privates Projekt. eazio ist **kein** offizielles Yazio-Produkt und nutzt dein eigenes Yazio-Konto über dessen inoffizielle API.

---

## Funktionen

- **Schnell-Tracking** – Zutaten als Text eintippen oder einfügen (`100 g Haferflocken, 1 Banane`). eazio erkennt Mengen, Einheiten (inkl. `EL`/`TL` → Gramm), ignoriert Gewürze ohne kcal und matcht alles automatisch auf Yazio-Produkte. Auswahl prüfen → loggen.
- **Mehrere Yazio-Konten** – verknüpfen, Standard wählen, pro Mahlzeit/Tageszeit loggen. Zugangsdaten werden **verschlüsselt** gespeichert (`MASTER_KEY`).
- **Presets** – wiederkehrende Mahlzeiten als Vorlage speichern und mit einem Tipp tracken.
- **Rezept-Import** – aus **Instagram**, **Blogs/Webseiten** oder per **eingefügtem Text**. Eine KI (Claude) extrahiert strukturierte Zutaten **und Kochschritte**. Pipeline: schema.org/Recipe-JSON-LD → Text-Fallback → LLM-Normalisierung.
- **Rezept-Sammlung** – als Karten mit Foto, Schwierigkeit & Zeit, mit **Favoriten** und **Suche**. Eigene Detailseite mit Zutaten und nummerierten Kochschritten.
- **Rezept tracken** – Portionsanteil wählen (Ganzes / ½ / ⅓ / ¼ oder eigener Faktor) → skalierte Zutaten in den Tracker übernehmen.
- **Einkaufsliste** – Zutaten kopieren als **Klartext**, **abhakbare Liste** (Apple Notes) oder direkt in die **Bring!**-App (über eine öffentliche, token-gesicherte JSON-LD-Seite).
- **Accounts** – offene Selbst-Registrierung (Username, E-Mail, Passwort) plus token-gesicherter Bootstrap-Endpoint für den ersten/Admin-Account.
- **Onboarding** – kurzer Wizard, der nach dem ersten Login durch die Funktionen führt (Status pro Nutzer gespeichert).
- **PWA** – installierbar, Web-App-Manifest, App-Icons, iOS-Teilen-Kurzbefehl & Android `share_target`.

---

## Tech-Stack

| Bereich   | Technologie |
|-----------|-------------|
| Backend   | [Fastify 5](https://fastify.dev/), TypeScript, [zod](https://zod.dev/) |
| Datenbank | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) + [drizzle-orm](https://orm.drizzle.team/) (handgeschriebene Migrationen) |
| Auth      | argon2-Passwort-Hashes, signierte httpOnly-Session-Cookies |
| KI        | [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) (Claude, Structured Outputs) |
| Externe   | [`yazio`](https://www.npmjs.com/package/yazio)-Client, [Apify](https://apify.com/) (Instagram-Caption-Scraping, optional) |
| Frontend  | [React 19](https://react.dev/), [Vite](https://vite.dev/), [react-router](https://reactrouter.com/) |
| Deployment| Docker (multi-stage), Docker Compose, hinter [Nginx Proxy Manager](https://nginxproxymanager.com/) |

---

## Projektstruktur

```
eazio/
├── server/                 # Fastify-API; liefert im Prod-Build auch das SPA aus
│   ├── src/
│   │   ├── app.ts          # App-Aufbau, Routen-Registrierung, SPA-Fallback
│   │   ├── index.ts        # Einstieg: Migrationen + Listen
│   │   ├── config/env.ts   # zod-validierte Umgebungsvariablen
│   │   ├── db/             # drizzle-Client, Schema, Migrator
│   │   ├── http/routes/    # auth, accounts, match, log, presets, recipes, settings, health
│   │   └── modules/        # auth, recipes (import/extract/llm/instagram/share), settings, …
│   └── drizzle/            # SQL-Migrationen + meta/_journal.json
├── web/                    # React-SPA (Vite)
│   └── src/
│       ├── pages/          # Tracker, Recipes, RecipeDetail, Import, Presets, Accounts, Login, Register
│       ├── components/     # Nav, Icons, OnboardingWizard, …
│       ├── auth/           # AuthContext, ProtectedRoute
│       ├── api/            # typisierter Fetch-Client
│       └── lib/            # Mengen-Skalierung, Nährwerte, Einkaufsliste
├── Dockerfile              # multi-stage (build: node:22-bookworm → run: -slim)
├── docker-compose.yml      # Service + Volume; veröffentlicht Host-Port hinter NPM
├── scripts/deploy.sh       # rsync + `docker compose up -d --build` über SSH
└── .env.example
```

---

## Schnellstart (Entwicklung)

**Voraussetzungen:** Node ≥ 22 (siehe `.nvmrc`).

```bash
# 1. Abhängigkeiten (npm workspaces)
npm install

# 2. Umgebung anlegen
cp .env.example .env
# MASTER_KEY und SESSION_SECRET erzeugen:
node -e "console.log('MASTER_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(24).toString('hex'))"
# ADMIN_BOOTSTRAP frei wählen (min. 8 Zeichen)

# 3a. API starten (Port 3000, mit Auto-Reload)
npm run dev

# 3b. In einem zweiten Terminal: SPA starten (Vite proxyt /api → :3000)
npm run dev --workspace web
```

Frontend dann unter der von Vite genannten URL (Standard `http://localhost:5173`).

```bash
npm test     # alle Tests (vitest, Server + Web)
npm run lint # Typecheck Server + Web
npm run build# SPA + Server bauen (web/dist, server/dist)
```

### Ersten Account anlegen

- **Im Browser:** `/register` öffnen und mit Username, E-Mail & Passwort registrieren (man ist danach direkt eingeloggt).
- **Per Token (Admin/erstmalig):**
  ```bash
  curl -X POST http://localhost:3000/api/auth/bootstrap \
    -H 'content-type: application/json' \
    -d '{"token":"<ADMIN_BOOTSTRAP>","username":"admin","password":"<min-8-Zeichen>"}'
  ```

---

## Umgebungsvariablen

| Variable | Pflicht | Default | Beschreibung |
|----------|:------:|---------|--------------|
| `MASTER_KEY` | ✅ | – | 32-Byte-Schlüssel (base64) zum Verschlüsseln der Yazio-Zugangsdaten |
| `SESSION_SECRET` | ✅ | – | Signaturschlüssel für Session-Cookies (min. 16 Zeichen) |
| `ADMIN_BOOTSTRAP` | ✅ | – | Token für `POST /api/auth/bootstrap` (min. 8 Zeichen) |
| `DATABASE_PATH` | – | `./data/eazio.db` | SQLite-Datei (im Docker: `/data/eazio.db`) |
| `PORT` | – | `3000` | HTTP-Port der API |
| `COOKIE_SECURE` | – | `true` | `false` setzen, wenn der Client das `Secure`-Cookie nicht hält (z. B. TLS-abfangende Netze) |
| `NODE_ENV` | – | `development` | `production` im Betrieb |
| `TZ` | – | `Europe/Berlin` | Zeitzone |
| `YAZIO_COUNTRIES` | – | `DE` | Länder für die Produktsuche |
| `YAZIO_LOCALES` | – | `de_DE,de_US` | Sprachen für die Produktsuche |
| `ANTHROPIC_API_KEY` | – | – | Claude-Key für den Rezept-Import. **Ohne ihn ist nur der Import-Tab deaktiviert**, der Rest läuft normal |
| `RECIPE_LLM_MODEL` | – | `claude-haiku-4-5` | Modell für die Zutaten-Extraktion |
| `APIFY_TOKEN` | – | – | Optional: löst Instagram-Links automatisch auf. Ohne ihn: Caption einfügen |
| `APIFY_INSTAGRAM_ACTOR` | – | `apify/instagram-scraper` | Apify-Actor fürs Instagram-Scraping |
| `EAZIO_PORT` | – | `8413` | Host-Port, den Docker Compose / NPM weiterleiten |

---

## Build & Deployment

eazio läuft als **ein** Container: der Server liefert die API **und** das gebaute SPA aus (SPA-Fallback auf `index.html`).

### Docker / Compose

```bash
docker compose up -d --build
```

- Multi-stage `Dockerfile`: Build in `node:22-bookworm` (native Module wie `better-sqlite3`/`argon2`), Laufzeit auf `-slim`.
- `docker-compose.yml` mountet ein Volume `eazio-data` nach `/data` (DB + gecachte Rezept-Bilder) und veröffentlicht `${EAZIO_PORT}:3000`.
- Die App wird typischerweise hinter **Nginx Proxy Manager** betrieben (TLS / Let's Encrypt, Weiterleitung der Domain auf `http://<host>:${EAZIO_PORT}`).
- Healthcheck: `GET /api/health`.

### Migrationen

Drizzle-Migrationen liegen als SQL in `server/drizzle/` (+ `meta/_journal.json`) und laufen **beim Start automatisch** (`runMigrations` in `index.ts`). Manuell:

```bash
npm run db:migrate --workspace server
```

### Deploy-Skript (SSH)

```bash
EAZIO_HOST=root@dein-server scripts/deploy.sh
```

Synct den Quellcode (ohne `node_modules`, `dist`, `data`, `.env`, `.git`), baut das Image auf dem Server neu, startet den Container und prüft den Healthcheck. `.env` und Volume-Daten bleiben auf dem Server.

---

## Architektur-Notizen

- **Zutaten-Matching** – Freitext wird zeilenweise geparst (Menge/Einheit/Name, auch vertikal eingefügt), `EL`/`TL` werden in Gramm umgerechnet, Gewürze ohne kcal über eine kuratierte Liste ausgeklammert; Kandidaten kommen aus der Yazio-Produktsuche, Nährwerte werden auf die Referenzmenge skaliert.
- **Rezept-Import** – `link`/`text` → bei Instagram via Apify die Caption holen → JSON-LD parsen oder Seitentext strippen → Claude liefert ein validiertes Schema (`{title, servings, difficulty, totalMinutes, ingredients[], steps[]}`) mit Retry. Bilder werden serverseitig ins `/data`-Volume gecacht.
- **Bring!-Export** – Bring lädt die Rezept-URL serverseitig, daher gibt es eine **öffentliche, token-gesicherte** Seite `GET /r/:id?t=…` mit schema.org/Recipe-JSON-LD. Der Token ist ein HMAC aus `SESSION_SECRET` über die Rezept-ID – nicht erratbar, ohne zusätzliche DB-Spalte.
- **Auth** – argon2-Hashes, konstante Login-Zeit (Dummy-Hash gegen User-Enumeration), signiertes httpOnly-Session-Cookie. Offene Registrierung (`/api/auth/register`, rate-limited) + token-Bootstrap.
- **Daten-Isolation** – jeder Datenzugriff ist strikt an die eingeloggte `userId` gebunden (Yazio-Konten, Logs, Presets, Rezepte, Lern-Daten). Es gibt **keinen** Endpoint, der eine fremde `userId`/`accountId` akzeptiert, und **keine** Admin-/Alle-Nutzer-Route – ein Nutzer kann also nie auf die Yazio-Konten oder -Daten eines anderen zugreifen. Abgesichert durch `server/src/http/routes/isolation.test.ts`. **Grenze:** Wer Server-root + `MASTER_KEY` besitzt (Betreiber), kann gespeicherte Yazio-Zugangsdaten technisch offline entschlüsseln; echte Null-Wissen-Trennung gegen den Betreiber erfordert clientseitige Verschlüsselung pro Nutzer-Passwort.

---

## Lizenz

Privates Projekt – keine Lizenz zur Weiterverbreitung. Nutzung deines eigenen Yazio-Kontos auf eigene Verantwortung.
