# Eazio — Implementierungs-Roadmap

> **For agentic workers:** Diese Roadmap indexiert 6 Milestone-Pläne. Jeder Milestone-Plan
> (`docs/superpowers/plans/2026-06-08-eazio-mN-*.md`) ist eigenständig lauffähig & testbar und
> wird mit `superpowers:subagent-driven-development` oder `superpowers:executing-plans` abgearbeitet.

**Quelle der Wahrheit:** `docs/superpowers/specs/2026-06-08-eazio-yazio-meal-tracker-design.md`

**Goal:** Web-App, die Freitext-Zutatenlisten via Live-Matching (mit Korrektur, Lernen, Presets) als Mahlzeiten in mehrere Yazio-Konten loggt. Mehrbenutzer, Docker hinter Nginx Proxy Manager.

**Architektur:** Monolith — Fastify (TS) REST-API + React/Vite SPA + SQLite (Drizzle), ein Docker-Image. Domänen-Trennung in Module (`auth`, `accounts`, `yazio`, `parsing`, `matching`, `learning`, `presets`, `meals`, `logging`).

**Tech Stack:** Node 22 (ESM), TypeScript (NodeNext), Fastify 5, better-sqlite3 + Drizzle ORM, argon2, zod, `yazio` (npm), React 18 + Vite, Vitest, Docker.

---

## Verifizierter Yazio-API-Vertrag (für alle Milestones maßgeblich)

- **Client:** `new Yazio(init)` mit `init: { credentials?: {username,password}; token?: Token | (()=>Token|Promise<Token|null>|null); onRefresh?: (a:{token:Token})=>any }`. Mindestens `credentials` ODER `token`.
- **Token:** `{ token_type, access_token, refresh_token, expires_in, expires_at }`. `expires_at` = epoch **ms**. Kein Refresh-Grant — Re-Login via Passwort-Grant; `onRefresh` feuert nur beim Neu-Login (nicht awaited).
- **`yazio.products.search(options)`** → `ProductSearchResult[]`. `options = { query: string; sex?: 'male'|'female'; countries?: string[](len2); locales?: string[](len5) }`. Result-Item:
  `{ score, name, product_id (uuid), serving (string), serving_quantity (number>0), amount (number>0), base_unit (string), producer (string), is_verified (boolean), nutrients: {'energy.energy','nutrient.carb','nutrient.protein','nutrient.fat'}, countries: string[], language: string }`.
- **`yazio.products.get(id)`** → `Product | null` mit `servings: {serving:string; amount:number}[]`, voller `nutrients` (24 Keys), `base_unit`. **Gramm je Serving** kommen aus `servings[]`.
- **`yazio.user.addConsumedItem(item)`** → `Promise<void>`. `item` flach, zwei Varianten:
  - mit Serving: `{ id(uuid), product_id(uuid), date(Date|string), daytime, amount(number), serving(string), serving_quantity(number) }`
  - rein Gramm: `… serving: null, serving_quantity: null`. **`id` generieren wir selbst** (`crypto.randomUUID()`).
- **`yazio.user.removeConsumedItem(id)`** → `Promise<void>`. `id` = die von uns generierte Consumed-Item-uuid (Einzel-String).
- **`yazio.user.getConsumedItems({date?})`** → `{ products: UserConsumedItem[]; … }`.
- **`yazio.user.getDailySummary({date?})`** → `UserDailySummary` mit `meals.{breakfast,lunch,dinner,snack}.nutrients` (BasicNutrients) + `goals`. **Kein** flacher Tages-Gesamtwert → ggf. über Meals summieren.
- **daytime:** `'breakfast'|'lunch'|'dinner'|'snack'` (Singular `snack`).
- **Datum:** API erwartet `YYYY-MM-DD`. `parseDate` nutzt `toISOString()` (UTC) → wir berechnen den Tag selbst in `TZ` und übergeben den fertigen String, um Mitternachts-Verschiebung zu vermeiden.

## Mengen- & Nährwert-Modell

- **Logging immer mit `amount` in Gramm** (Yazio-Basis). `g/kg/ml/l` → Gramm (ml≈g bzgl. `base_unit`).
- **Stück/Portion** (`1 Banane`): `serving = result.serving`, `serving_quantity = qty`, und `amount` (Gramm) via `products.get(product_id).servings[]` (Gramm je Serving × qty). Fallback: UI lässt Gramm direkt setzen.
- **Nährwert-Anzeige** (nur UI-Hilfe): `nutrient × (consumedGrams / result.amount)`. Energie-Einheit (kcal vs. kJ) in M3 empirisch verifizieren und korrekt labeln (`UnitsSchema.unit_energy` aus DailySummary als Hinweis).

## Undo-Modell

Wir generieren je Zutat eine uuid (`id`), senden sie an `addConsumedItem`, speichern alle uuids in `log_events.consumed_ids_json`. Undo = `removeConsumedItem(uuid)` je gespeicherter id; `log_events.status` → `undone`.

---

## Milestones

| M | Datei | Ziel (eigenständig testbar) |
|---|-------|------------------------------|
| **M1** | `…-m1-foundation-auth.md` | Monorepo-Scaffold, ENV-Config, **vollständiges** Drizzle-Schema + Migrations, AES-256-GCM-Krypto, App-Auth (argon2, Sessions, Bootstrap-Token), Health. → Nutzer anlegen/einloggen/Session prüfen. |
| **M2** | `…-m2-yazio-accounts.md` | Yazio-Konten verknüpfen (CRUD), Credentials/Token verschlüsselt, Yazio-Client-Wrapper mit Token-Caching (`token`-Resolver + `onRefresh`), Verbindungstest. → Konto linken & Auth (gemockt + optional live). |
| **M3** | `…-m3-parsing-matching.md` | Zeilen-Parser + Einheiten-Normalisierung, Produktsuche/Best-Match, Alias-Gedächtnis, Nährwert-Skalierung, Serving-Auflösung via `products.get`. → POST Freitext ⇒ geparste Zeilen + Top-10-Kandidaten. |
| **M4** | `…-m4-logging-presets.md` | daytime-Resolver (TZ-Fenster), Consumed-Item-Builder (uuid-Gen), Submit (Loop), `log_events`, Undo, Presets-CRUD (Speichern/Laden). → Submit ⇒ geloggt (gemockt), Undo, Preset round-trip. |
| **M5** | `…-m5-frontend.md` | React/Vite SPA: Login, Tracker (Zutaten-Tabelle, Produkt-Dropdown, Nährwert-Badges, Mahlzeit-/Konto-Selector), Presets-, Konten-, Settings-Seiten; typisierter API-Client. → Component-Tests + E2E-Flow. |
| **M6** | `…-m6-deploy.md` | Multi-Stage Dockerfile, `docker-compose.yml`, gemeinsames Docker-Netz für NPM, `scripts/deploy.sh` (192.168.178.33, root+SSH-Key), Healthcheck, `.env.example`. → Container baut & läuft, NPM-Proxy-Host. |

**Reihenfolge:** strikt M1→M6 (Schichten bauen aufeinander auf). Das vollständige Drizzle-Schema wird bereits in **M1** definiert, damit spätere Milestones nur darauf zugreifen.

**Vorgehen für Folge-Pläne:** M2–M6 werden **just-in-time** nach Abschluss des jeweils vorigen Milestones geschrieben — so spiegeln Typen/Signaturen den tatsächlich gebauten Code wider (bessere Konsistenz als alles vorab zu spekulieren).
