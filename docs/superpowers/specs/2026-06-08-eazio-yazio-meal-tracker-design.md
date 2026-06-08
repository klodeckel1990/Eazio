# Eazio — Yazio Meal Tracker · Design-Spec

- **Datum:** 2026-06-08
- **Status:** Freigegeben (Brainstorming abgeschlossen)
- **Stack-Entscheidung:** Monolith — Fastify (TS) API + React/Vite SPA + SQLite (Drizzle), ein Docker-Image hinter Nginx Proxy Manager

## 1. Ziel & Scope

Eine Web-App, die das Yazio-Tracking beschleunigt: Nutzer tippen/fügen eine **Zutatenliste als Freitext** ein (z.B. `80g Haferflocken, 200ml Milch, 1 Banane`). Das Backend zerlegt jede Zeile, sucht live in Yazios Produktdatenbank, wählt den **besten Treffer vor** und bietet pro Zeile ein **Dropdown mit ~10 Alternativen inkl. Nährwerten** zur manuellen Korrektur. Die **Mahlzeit** (`daytime`) wird automatisch nach Uhrzeit vorbelegt und ist überschreibbar. Nach Bestätigung werden alle Zeilen als Consumed-Items in das gewählte Yazio-Konto geloggt. Korrekturen werden **gelernt**; korrigierte Listen sind als **Presets** speicherbar. Das System ist **mehrbenutzerfähig** (eigener App-Login) und verwaltet mehrere Yazio-Accounts via verschlüsselter Credential-DB.

### Non-Goals (YAGNI)
- Kein eigenes Nährwert-Tracking/Reporting — Yazio bleibt die Quelle der Wahrheit.
- Kein Public-Signup (Nutzeranlage via Bootstrap-Token).
- Keine Barcode-/Foto-Erkennung.
- Keine native Mobile-App (responsive Web reicht).
- Keine horizontale Skalierung/Postgres (SQLite genügt bei wenigen Nutzern).

## 2. Nutzer & Anwendungsfälle

- **Primärnutzer:** Privatperson(en) auf einem Heimserver, die Yazio nutzen und Mahlzeiten schneller erfassen wollen.
- **Multi-User:** Mehrere App-Nutzer mit je eigenem Login.
- **Multi-Account:** Ein App-Nutzer kann **1..n Yazio-Konten** verknüpfen (z.B. selbst + Partnerin) und das aktive Zielkonto wählen.

Kern-Use-Cases:
1. Freitext-Liste eingeben → Produkte bestätigen/korrigieren → in Yazio loggen.
2. Wiederkehrende Mahlzeit als Preset speichern und mit einem Klick erneut loggen.
3. Letztes Log rückgängig machen (Undo).
4. Yazio-Konto verknüpfen/entfernen, aktives Konto umschalten.

## 3. Architektur

Ein Container, zwei logische Teile, klare Domänen-Trennung (bounded contexts):

```
Browser (React SPA) ──HTTPS via Nginx Proxy Manager──▶ Fastify API (TS)
                                                          ├─ auth      (App-Login, Sessions, argon2)
                                                          ├─ accounts  (Yazio-Konten, Cred-Krypto, Token-Cache)
                                                          ├─ yazio     (Wrapper um `yazio`-Client, 1 Instanz je Konto)
                                                          ├─ parsing   (Freitext → {qty, unit, name})
                                                          ├─ matching  (Suche + Best-Match + Alias-Auflösung)
                                                          ├─ learning  (Alias-Gedächtnis)
                                                          ├─ presets   (CRUD, Liste speichern/laden)
                                                          ├─ meals     (daytime-Zeitfenster)
                                                          └─ logging   (Consumed-Item-Builder, Submit, Undo, Event-Log)
                                                                │
                                                          SQLite (Drizzle) ◀── Docker-Volume
```

- **Backend:** Fastify + TypeScript, `zod`-Validierung an allen API-Grenzen, Session-Cookie-Auth (httpOnly, secure, SameSite=Lax), `argon2id` für App-Passwörter.
- **Frontend:** React + Vite SPA. Reaktive Pro-Zeile-Dropdowns mit Live-Suche & Nährwert-Vorschau. Als statische Assets vom selben Container ausgeliefert (Fastify static) oder direkt von NPM.
- **DB:** SQLite via Drizzle ORM (typisiert, Migrations), eine Datei auf einem Docker-Volume.
- **Yazio-Integration:** offizielle inoffizielle Library [`yazio`](https://github.com/juriadams/yazio) (npm), zero-dependency, TS.

## 4. Datenmodell (SQLite / Drizzle)

```
users(
  id            TEXT PK (uuid),
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,            -- argon2id
  created_at    INTEGER NOT NULL
)

yazio_accounts(
  id              TEXT PK (uuid),
  user_id         TEXT NOT NULL → users(id),
  label           TEXT NOT NULL,          -- frei wählbar, z.B. "Ich", "Partnerin"
  yazio_username  TEXT NOT NULL,
  enc_credentials TEXT NOT NULL,          -- AES-256-GCM(JSON{username,password})
  enc_tokens      TEXT,                   -- AES-256-GCM(JSON{access,refresh,expires})
  is_default      INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL
)

aliases(
  id                       TEXT PK (uuid),
  user_id                  TEXT NOT NULL → users(id),
  normalized_name          TEXT NOT NULL,   -- lowercased, getrimmt, akzentfrei
  product_id               TEXT NOT NULL,   -- Yazio product_id
  default_serving          TEXT,            -- z.B. "g" | "ml" | "portion" | null
  default_serving_quantity REAL,
  default_amount_g         REAL,
  hits                     INTEGER NOT NULL DEFAULT 1,
  updated_at               INTEGER NOT NULL,
  UNIQUE(user_id, normalized_name)
)

presets(
  id         TEXT PK (uuid),
  user_id    TEXT NOT NULL → users(id),
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, name)
)

preset_items(
  id               TEXT PK (uuid),
  preset_id        TEXT NOT NULL → presets(id),
  position         INTEGER NOT NULL,
  raw_text         TEXT NOT NULL,           -- Originaltext der Zeile
  product_id       TEXT NOT NULL,
  serving          TEXT,
  serving_quantity REAL,
  amount_g         REAL NOT NULL
)

log_events(                                 -- Audit / Event-Log / Undo-Quelle
  id               TEXT PK (uuid),
  user_id          TEXT NOT NULL → users(id),
  yazio_account_id TEXT NOT NULL → yazio_accounts(id),
  date             TEXT NOT NULL,           -- YYYY-MM-DD (Log-Datum)
  daytime          TEXT NOT NULL,           -- breakfast|lunch|dinner|snack
  status           TEXT NOT NULL,           -- pending|logged|undone|error
  items_json       TEXT NOT NULL,           -- Snapshot der eingereichten Zeilen
  consumed_ids_json TEXT,                   -- Yazio consumed-item UUIDs (für Undo)
  created_at       INTEGER NOT NULL
)

sessions(                                   -- serverseitige Sessions (invalidierbar)
  id         TEXT PK,                        -- = opaker Session-Token im Cookie
  user_id    TEXT NOT NULL → users(id),
  expires_at INTEGER NOT NULL
)
```

- `enc_*`-Felder: **AES-256-GCM**, Key aus `MASTER_KEY` (ENV). Klartext-Creds werden nie geloggt, nur im Speicher zur Yazio-Auth entschlüsselt.
- `log_events` erfüllt die „event sourcing für State-Changes"-Vorgabe und liefert die `consumed_ids` fürs Undo.

## 5. Kern-Flow

1. **Eingabe:** Freitext (mehrzeilig und/oder kommagetrennt) + gewähltes Yazio-Zielkonto.
2. **Parsing** (`parsing`): je Zeile → `{ qty, unit, name }`.
3. **Matching** (`matching` + `learning`): existiert ein **Alias** für `normalized_name` → Produkt direkt vorbelegt (kein API-Call nötig). Sonst `products.search(name)` → bester Treffer (höchster `score`) vorgewählt + **Top-10** Kandidaten.
4. **Bestätigungs-UI:** Tabelle, eine Zeile je Zutat:
   - gewähltes Produkt + Dropdown(10) mit `name` / `producer` / `is_verified`-Badge,
   - **Nährwerte umgerechnet auf die eingegebene Menge** (kcal, KH, Protein, Fett aus `nutrients` × Menge/Basismenge),
   - Menge + Serving pro Zeile editierbar.
   - Oben: **Mahlzeit-Selector** (automatisch vorbelegt, überschreibbar).
5. **Submit** (`logging`): ein `POST /user/consumed-items` mit `products[]` (je Zeile ein Eintrag, gleiches `date` + `daytime`); schreibt `log_events` (status `logged`, speichert zurückgegebene `consumed_ids`); upsert't geänderte **Aliase** (`hits++`).
6. **Ergebnis:** Erfolg + aktualisierte Tagessumme (`user.getDailySummary`); **„Undo letztes Log"** (DELETE mit gespeicherten `consumed_ids`); optional **„Als Preset speichern"**.

## 6. Yazio-API-Vertrag (verifiziert aus Library-Quellcode)

**Produktsuche** — `GET /products/search?query=…&sex=…&countries=DE,US&locales=de_US,en_US`
Antwort: Array von Produkten mit:
`product_id` (uuid), `name`, `producer`, `score`, `serving`, `serving_quantity`, `amount`, `base_unit`, `is_verified`, `nutrients` (`energy.energy`, `nutrient.carb`, `nutrient.protein`, `nutrient.fat`), `countries`, `language`.

**Consumed-Item anlegen** — `POST /user/consumed-items`
```json
{
  "recipe_portions": [],
  "simple_products": [],
  "products": [
    { "id": "uuid", "product_id": "uuid", "date": "<parsed>",
      "daytime": "breakfast|lunch|dinner|snack",
      "amount": 80, "serving": null, "serving_quantity": null }
  ]
}
```
Regel: entweder `serving` **und** `serving_quantity` gesetzt, oder **beide** `null` (reiner Gramm-Eintrag).

**Consumed-Item löschen** — `DELETE /user/consumed-items` mit `["<consumed-item-uuid>"]`
(Hinweis: das ist die ID des Eintrags, **nicht** die `product_id`.)

**Client-Methoden (Library):** `products.search(opts)`, `products.get(id)`, `user.addConsumedItem(opts)`, `user.getConsumedItems(opts)`, `user.removeConsumedItem(opts)`, `user.getDailySummary(opts)`. Auth via `new Yazio({ credentials:{username,password}, onRefresh })`.

> **Offen/zu verifizieren in der Umsetzung:** exakte Einheit von `energy.energy` (vermutlich kcal) und die genaue Umrechnung `nutrients` → eingegebene Menge anhand `amount`/`base_unit`.

## 7. Parsing & Einheiten

Pro Zeile wird `{ qty, unit, name }` extrahiert. Unterstützte Muster (DE):
- `80g Haferflocken`, `200 ml Milch`, `1,5 kg …` → Masse/Volumen.
- `1 Banane`, `2 Eier`, `1 Scheibe Brot`, `2 EL Öl` → Portions-/Stückzahl.
- Reihenfolge `Menge Einheit Name` **und** `Name Menge Einheit` tolerieren.

Einheiten-Normalisierung: `kg→g`, `l→ml`; ohne Masse/Volumen-Einheit → Portionsanzahl, abgebildet auf `serving`/`serving_quantity` des gewählten Produkts. Fehlt eine Menge ganz → Default 1 Portion. Alle Werte sind im UI editierbar (Fallback bei Fehlinterpretation).

## 8. Matching & Lernen

- **Reihenfolge:** Alias-Lookup zuerst (deterministisch, kein API-Call) → sonst Live-Suche.
- **Normalisierung** des Namens: lowercase, trim, Akzente/Sonderzeichen entfernen, Mehrfach-Spaces kollabieren.
- **Best-Match:** höchster `score`; verifizierte Produkte (`is_verified`) bei Gleichstand bevorzugt.
- **Lernen:** beim Submit `aliases(user, normalized_name) → product_id (+ serving/amount)` upsert, `hits++`, `updated_at`. Manuelle Korrektur überschreibt den Alias.
- **Such-Konfiguration:** `countries`/`locales` aus ENV (Default `DE` / `de_DE,de_US`), kurzes In-Memory-Caching gleicher Queries zur Reduktion von API-Calls.

## 9. Presets

- „Als Preset speichern" benennt eine korrigierte Liste (`Mein Müsli`) und speichert `preset_items` (Produkt + Menge + Serving je Zeile, plus `raw_text`).
- Im Tracker per Dropdown/Name laden → Zeilen vorbefüllt; nur noch Mahlzeit/Konto bestätigen.
- Presets verwaltbar: umbenennen, löschen, aus aktueller Liste aktualisieren.

## 10. Mahlzeit-Zuordnung

Pro Nutzer konfigurierbare Zeitfenster, Defaults:
`breakfast 05:00–11:00`, `lunch 11:00–15:00`, `dinner 15:00–21:00`, sonst `snack`.
Auflösung über Server-Zeit mit `TZ` (Default `Europe/Berlin`). Im UI pro Eingabe überschreibbar (deckt Meal-Prep am Vorabend ab). Das Log-`date` ist standardmäßig „heute" in `TZ`, optional wählbar.

## 11. Auth & Sicherheit

- **App-Login:** Username + Passwort (`argon2id`), Session-Cookie (httpOnly, `secure` hinter NPM, SameSite=Lax). Rate-Limit auf Login-Endpoint.
- **Nutzeranlage:** kein offenes Public-Signup. Erst-/Weitere Nutzer via `ADMIN_BOOTSTRAP`-Token (ENV) anlegen.
- **Yazio-Creds:** AES-256-GCM verschlüsselt at rest; Key aus `MASTER_KEY` (32 Byte, base64; ENV/Secret, nicht im Image, nicht in git). Entschlüsselung nur im Speicher.
- **Token-Caching:** `yazio`-Client mit `onRefresh` → erneuerte Tokens verschlüsselt in `enc_tokens` persistieren (kein Re-Login je Request).
- **Validierung:** `zod` an allen API-Grenzen; Pfad-/Eingabe-Sanitisierung.
- **Secrets:** `.env` nie committen; `.env.example` mitliefern. Keine Klartext-Creds in Logs.

## 12. Multi-Account-Modell

Ein App-Nutzer verknüpft **1..n Yazio-Konten** (`yazio_accounts`), eines als `is_default`. Im Tracker wird das **aktive Zielkonto** gewählt; das Log geht an dieses Konto. Aliase und Presets hängen am **App-Nutzer** (nicht am Yazio-Konto), da das Produkt-Matching kontoübergreifend identisch ist.

## 13. Deployment

- **Multi-Stage Dockerfile:** Stage 1 baut `web/` (Vite) + `server/` (tsc/esbuild) → Stage 2 schlankes Node-Runtime-Image mit kompiliertem Server + statischen Web-Assets.
- **`docker-compose.yml`:** App-Service + benanntes Volume für SQLite (`/data`) + `.env` (`MASTER_KEY`, `SESSION_SECRET`, `TZ`, `ADMIN_BOOTSTRAP`, `DATABASE_PATH`). Migrations laufen beim Start.
- **Nginx Proxy Manager:** App hängt am **gemeinsamen externen Docker-Netz** von NPM (kein Host-Port nötig). In NPM einen **Proxy-Host** anlegen, Forward auf `http://eazio:3000` (Container-Name + interner Port), TLS/Domain über NPM. Alternative: Host-Port mappen und in NPM auf `192.168.178.33:<port>` forwarden.
- **Deploy auf `192.168.178.33` (root + SSH-Key):** `scripts/deploy.sh` — Image bauen/transferieren, `docker compose up -d`, Migrations, Healthcheck.

## 14. Testing-Strategie

`vitest`, **mock-first (TDD London)** gemäß CLAUDE.md:
- **Unit:** Parser, Einheiten-Normalisierung, Matcher/Score, Alias-Upsert, AES-Krypto, daytime-Resolver, Consumed-Item-Builder (Yazio-Client gemockt).
- **Integration:** API-Routen gegen Test-SQLite (In-Memory), Auth-Flows, Submit→Undo-Zyklus.
- **Frontend:** Component-Tests für die Matching-Tabelle (Dropdown, Mengen-/Nährwert-Neuberechnung) und Mahlzeit-Selector.
- Tests nach jeder Code-Änderung; Build muss vor Commit grün sein.

## 15. Projektstruktur (Monorepo)

```
/ (Root: nur essentielle Config)
├─ docker-compose.yml
├─ Dockerfile
├─ .env.example
├─ package.json            (Workspaces: server, web)
├─ server/
│  └─ src/
│     ├─ index.ts          (Bootstrap)
│     ├─ config/           (ENV-Schema)
│     ├─ db/               (Drizzle-Schema, Migrations, Client)
│     ├─ crypto/           (AES-256-GCM Helpers)
│     ├─ http/             (Routen, Error-Handling, Validierung)
│     └─ modules/
│        ├─ auth/ accounts/ yazio/ parsing/ matching/
│        ├─ learning/ presets/ meals/ logging/
│  └─ tests/
├─ web/
│  └─ src/
│     ├─ pages/            (Login, Tracker, Presets, Accounts, Settings)
│     ├─ components/       (IngredientLineRow, ProductDropdown, NutritionBadge, MealSelector)
│     └─ api/              (typisierter Client)
│  └─ tests/
└─ docs/superpowers/specs/ (dieses Dokument)
```

Dateien < 500 Zeilen, typisierte Interfaces an jeder Modulgrenze.

## 16. Konfiguration (ENV)

| Variable | Zweck | Default |
|---|---|---|
| `PORT` | interner App-Port | `3000` |
| `NODE_ENV` | Umgebung | `production` |
| `DATABASE_PATH` | SQLite-Datei | `/data/eazio.db` |
| `MASTER_KEY` | AES-256-GCM Key (base64, 32 Byte) | — (Pflicht) |
| `SESSION_SECRET` | Cookie-Signatur | — (Pflicht) |
| `ADMIN_BOOTSTRAP` | Token zur Nutzeranlage | — (Pflicht beim Setup) |
| `TZ` | Zeitzone für daytime/date | `Europe/Berlin` |
| `COOKIE_SECURE` | Secure-Cookie hinter Proxy | `true` |
| `YAZIO_COUNTRIES` | Such-Länder | `DE` |
| `YAZIO_LOCALES` | Such-Locales | `de_DE,de_US` |

## 17. Offene Punkte / spätere Erweiterungen

- Exakte Einheit von `energy.energy` (kcal vs. kJ) + Nährwert-Umrechnung in der Umsetzung verifizieren.
- Rezepte/`recipe_portions` und `simple_products` werden zunächst nicht genutzt (nur `products[]`).
- Mögliche Erweiterungen: Verlauf/History-Ansicht, Mengen-Schnelltasten, Import bestehender Yazio-Favoriten als Alias-Seed.

## 18. Entscheidungen (Log)

| # | Entscheidung |
|---|---|
| 1 | Freitext-Eingabe mit Live-Matching, bester Treffer vorgewählt + Top-10-Dropdown mit Nährwerten zur Korrektur. |
| 2 | Mahlzeit automatisch nach Uhrzeit, pro Eingabe überschreibbar. |
| 3 | Korrekturen werden gelernt (Alias-Gedächtnis); korrigierte Listen als benannte Presets speicherbar. |
| 4 | Eigener App-Login; Yazio-Credentials AES-256-GCM verschlüsselt at rest. |
| 5 | Stack: Fastify (TS) + React/Vite + SQLite (Drizzle), ein Docker-Image. |
| 6 | Deployment hinter Nginx Proxy Manager über gemeinsames Docker-Netz. |
| 7 | Nutzeranlage via `ADMIN_BOOTSTRAP`-Token (kein Public-Signup). |
| 8 | Ein App-Nutzer kann 1..n Yazio-Konten verknüpfen, aktives Zielkonto wählbar. |
