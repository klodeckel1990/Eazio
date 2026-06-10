# Roadmap: Eazio → eigenständige Tracking-App

Ziel: Eigenständiges, vermarktbares Produkt mit iOS/Android-Apps (Capacitor), eigener
Lebensmitteldatenbank (BLS 4.0 + Open Food Facts) und Widgets/Live Activities als
Motivations-Kernfeature. Yazio läuft übergangsweise als optionaler Dual-Write-Spiegel weiter.

**Grundsatzentscheidungen** (09.06.2026):
Capacitor statt Rewrite · eigenes Tagebuch = Quelle der Wahrheit, Yazio-Mirror optional ·
Beta zuerst, Hosting/DSGVO vor öffentlichem Launch · Premium-Abo später (Feature-Flags
vorbereiten) · Umbenennung vor Store-Launch (Bundle-IDs!).

## Phasen

| # | Phase | Inhalt | Status |
|---|-------|--------|--------|
| 1 | Bearer-Auth | Opake Tokens (sha256-Hash in `sessions`, 90 d gleitend) neben Cookie, CORS für Capacitor-Origins, CSP/Helmet, Geräteliste + Remote-Revoke | ✅ 09.06.2026 |
| 2 | Eigene Food-DB | `foods`-Tabelle (bls/off/custom), BLS-4.0-Import (CC BY 4.0, Excel), FTS5-Suche (Umlaute/Komposita), OFF-Barcode-Cache, Custom Foods | ✅ 09.06.2026 |
| 3 | Tagebuch | `diary_entries` (denormalisierte Nährwert-Snapshots) als Quelle der Wahrheit, Ziele/Wasser/Streak, asynchroner Yazio-Mirror (`pending→mirrored/skipped/failed`), `GET /api/widget/summary`, TrackerPage-Umbau | ✅ 09.06.2026 |
| 4 | PWA | vite-plugin-pwa, Offline-Lesen (NetworkFirst für Diary, SWR für Foods), Cache-Clear bei Logout | ✅ 09.06.2026 |
| 5 | Capacitor-Shell | `app/`-Workspace ✅, **iOS im Simulator verifiziert** (iPhone 16 Pro/iOS 26.5, gebündelte Assets, Login rendert). Gotcha behoben: SW-Registrierung crashte den `capacitor://`-Boot. Offen: Android (SDK-Lizenzen beim User), Gerät (iOS-26.5-Device-Support in Xcode laden), Barcode-Scanner, `SharedAuth`, TestFlight (Apple-Account) | 🔄 fast fertig |
| 6 | Widgets + Live Activities | **iOS-Widget ✅** (Kalorienring + Streak klein, + Makros/Wasser mittel; Token via Shared-Keychain-Gruppe `$(AppIdentifierPrefix)de.tellerwert.shared` — App Groups gehen NICHT auf Personal Teams; Reload nach jedem Log). Offen: interaktives Wasser-Widget (App Intents), Live Activities (brauchen APNs = bezahlter Account), Android Glance | 🔄 |
| 7 | Launch-Paket | Hosting-Migration (EU-Cloud, Postgres), DSGVO, Premium/IAP | offen |

~~Parallel zu 2–4: Namensfindung~~ → **Entschieden (09.06.2026): „Tellerwert"**. Logos liegen in
`docs/brand/` (App-Icon + Full Logo), Web-Branding umgestellt. Offen: tellerwert.de registrieren
(war frei lt. DENIC), tellerwert.app prüfen, DPMA-Markenrecherche vor Store-Launch.
Bundle-ID-Vorschlag für Phase 5: `de.tellerwert.app`.

## Architektur-Eckpunkte (Phase 2–6, durchdesignt)

- **foods**: `unique(source, sourceId)`; ~10 Nährwert-Spalten (kcal, Makros, Salz) + `nutrientsJson`
  für die restlichen ~128 BLS-Nährstoffe; `servingsJson`; FTS5 `unicode61 remove_diacritics 2` +
  `searchTerms` (ue-Varianten, Dekomposita). Ranking: Custom > Aliase > BLS > OFF + Nutzungshäufigkeit.
- **BLS-Import**: verifiziert — BLS 4.0 nutzt EuroFIR-Codes (ENERCC, PROT625, CHO, …), nicht die
  alten BLS-3.x-Codes. Pipeline: `scripts/convert-bls.ts` (xlsx → `seeds/bls-4.0.json.gz`, committed)
  → `node dist/scripts/import-bls.js` (idempotent, auch im Container). `TR`/`<LOD`/`<LOQ` → 0.
- **diary_entries**: Snapshots statt Joins (stabile Historie trotz OFF-Refreshes); Mirror läuft
  nach Commit via `setImmediate`, niemals blockierend; „skipped" ist sichtbarer Zustand.
  Legacy `aliases`/`log_events` bleiben für den Mirror; neues Lernen in `food_aliases`.
- **Widget-Summary**: 3 indizierte Queries; Streak inkrementell in `user_stats` (kein History-Scan).
- **Capacitor**: `webDir: '../web/dist'`; `VITE_API_BASE` wird im Native-Build eingebrannt
  (Web bleibt same-origin). Widgets lesen den Bearer-Token aus Shared Keychain (iOS) bzw.
  EncryptedSharedPreferences (Android) und rufen das Backend direkt.
- **Feature-Flags**: `users.featureFlags` (server-managed, read-only in `/api/auth/me`).
