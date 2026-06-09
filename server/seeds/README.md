# Daten-Seeds

## bls-4.0.json.gz

Komprimierter Seed der deutschen Nährstoffdatenbank, erzeugt aus dem offiziellen
Excel-Download via `npx tsx scripts/convert-bls.ts <xlsx>`. Import in die Datenbank:
`node dist/scripts/import-bls.js` (idempotent, upsert über `bls:<code>`).

**Quelle & Lizenz:** Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS),
Version 4.0 – Deutsche Nährstoffdatenbank. Karlsruhe.
DOI: 10.25826/Data20251217-134202-0 — Lizenz: CC BY 4.0
(https://blsdb.de). Diese Namensnennung muss in der App/Produktdoku erhalten bleiben.

Sonderwerte aus dem Original: `TR` (Spuren) sowie `<LOD`/`<LOQ` (unter Nachweis-/
Bestimmungsgrenze) werden als 0 importiert; `-` (kein Wert) bleibt leer.
