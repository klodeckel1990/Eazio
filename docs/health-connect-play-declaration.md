# Google Play – Health Connect Declaration (Tellerwert)

Die Health-Connect-Nutzung muss vor dem Upload eines Builds mit den
`android.permission.health.*`-Berechtigungen in der **Play Console** deklariert
werden. Das ist ein **manuelles Formular** (die AndroidPublisher-API deckt es
nicht ab) und **review-pflichtig** → Release-Blocker.

**Wo:** Play Console → App auswählen → **Richtlinie → App-Inhalte** →
Abschnitt **„Health Connect"** (bzw. „Health apps") → Deklaration ausfüllen.

**Datenschutz-URL (wird abgefragt):** https://tellerwert.de/datenschutz

---

## Angeforderte Health-Connect-Datentypen + Zweck (zum Einfügen)

| Permission | Datentyp | Zugriff | Zweck (EN, für den Review) |
|---|---|---|---|
| `READ_STEPS` | Steps | Read | Show the user's daily step count in the food/activity diary and factor it into the daily energy balance. |
| `READ_ACTIVE_CALORIES_BURNED` | Active calories burned | Read | Show active energy in the diary and add it to the daily calorie target. |
| `READ_WEIGHT` | Weight | Read | Display the latest body weight in the user's profile/progress and use it for goal calculation. |
| `WRITE_NUTRITION` | Nutrition | Write | Write back the user's logged daily nutrition totals (energy, protein, fat, carbohydrates) so their meals appear in Health Connect. |
| `WRITE_HYDRATION` | Hydration | Write | Write back the user's logged daily water intake to Health Connect. |

## Pflicht-Bestätigungen im Formular
- **Zugriff nur nach ausdrücklichem Opt-in** des Nutzers (Einstellung „Apple Health / Health Connect"); jederzeit widerrufbar.
- Daten werden **ausschließlich** für die obigen Funktionen genutzt — **keine Werbung**, **kein Verkauf**, **keine Weitergabe an Dritte**.
- Verarbeitung im Einklang mit der **Health Connect Permissions Policy** und den **User Data**-Richtlinien von Google Play.
- Gelesene Werte werden auf dem eigenen Server (Deutschland) nur zur Anzeige im Tagebuch gespeichert; bei Kontolöschung mit entfernt.

## Verknüpfte Aufgaben
- **Data-Safety-Formular** entsprechend aktualisieren: „Health and fitness" als erhobene/übertragene Datenkategorie (Steps/Calories/Weight), optional, nutzergesteuert, verschlüsselt übertragen, löschbar.
- Datenschutzerklärung enthält den Health-Connect-Abschnitt (§5, `server/src/http/routes/legal.routes.ts`, live unter /datenschutz).
- Erst **nach** Freigabe der Deklaration einen Build mit den Health-Permissions auf einen Track hochladen (sonst Ablehnungsrisiko).

Siehe auch `~/.claude/.../memory/tellerwert-health-connect.md`.
