export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim()
}

// Filler / qualifier words that hurt product search — size, ripeness, preparation
// and generic phrases. Stored in normalizeName() form (lowercase, accent- and
// ß-folded) and matched whole-word, so compound names like "Feinblatt" survive.
const QUALIFIERS = new Set([
  'klein', 'kleine', 'kleiner', 'kleines', 'gross', 'grosse', 'grosser', 'grosses', 'grossen',
  'mittel', 'mittelgross', 'mittelgrosse',
  'reif', 'reife', 'reifer', 'reifes', 'frisch', 'frische', 'frischer', 'frisches',
  'roh', 'rohe', 'roher', 'gekocht', 'gekochte', 'gedunstet', 'gedunstete',
  'getrocknet', 'getrocknete', 'tiefgekuhlt', 'tiefgekuhlte', 'gefroren', 'gefrorene',
  'gemischt', 'gemischte', 'gemischter', 'geschrotet', 'geschrotete',
  'gemahlen', 'gemahlene', 'gehackt', 'gehackte', 'gerieben', 'geriebene', 'geriebener',
  'rosenscharf', 'rosenscharfes', 'edelsuess', 'edelsuesses',
  'geschaelt', 'geschaelte', 'geschaelter', 'gewaschen', 'gewaschene', 'entkernt',
  'entkernte', 'enthaeutet', 'ganz', 'ganze', 'ganzer', 'ganzes',
  'weich', 'weiche', 'weicher', 'weiches', 'zerlassen', 'zerlassene',
  'geschmolzen', 'geschmolzene', 'gewurfelt', 'gewurfelte', 'gedampft', 'gedampfte',
  'puriert', 'purierte', 'fein', 'feine', 'feiner', 'grob', 'grobe',
  'optional', 'ca', 'etwa', 'etwas', 'evtl', 'ggf', 'ungefahr',
  'nach', 'geschmack', 'wahl', 'belieben', 'saison', 'pro', 'portion', 'stuck',
  'der', 'die', 'das',
  // bundle/packaging words that survive parsing in older saved texts
  'bund', 'zehe', 'zehen', 'stange', 'stangen', 'kopf', 'zweig', 'zweige',
  'packung', 'packchen', 'beutel', 'wurfel', 'handvoll', 'blatt', 'blatter',
  // fraction words (safety net for already-saved texts)
  'halb', 'halbe', 'halber', 'halbes', 'viertel', 'dreiviertel',
  // leanness adjectives — the AI rerank still sees the full name and can
  // prefer the matching fat level among the candidates
  'mager', 'magere', 'mageres', 'magerer',
  'fettarm', 'fettarme', 'fettarmes', 'fettarmer',
  // Herkunfts-/Größen-Präfixe ("Bio-Zitrone", "Baby-Blattspinat", "TK-Erbsen")
  'bio', 'baby', 'jung', 'junge', 'mini', 'tk', 'tiefkuhl', 'tiefkuehl',
  // Koch-/Farb-Eigenschaften — die KI sieht den vollen Namen und wählt die Variante
  'festkochend', 'festkochende', 'mehligkochend', 'mehligkochende', 'vorwiegend',
  'dunkel', 'dunkle', 'dunkler', 'dunkles', 'hell', 'helle', 'heller', 'helles',
  'weiss', 'weisse', 'weisser', 'weisses',
  // englische Rezepte (Allrecipes, Serious Eats, …)
  'softened', 'melted', 'diced', 'crushed', 'minced', 'chopped', 'sliced',
  'peeled', 'grated', 'toasted', 'mashed', 'packed', 'divided', 'drained',
  'rinsed', 'beaten', 'dried', 'fresh', 'freshly', 'large', 'medium', 'small',
  'whole', 'ripe', 'lean', 'boneless', 'skinless', 'unsalted', 'salted',
  'granulated', 'kosher', 'dry', 'thick', 'thin', 'homemade', 'store', 'bought',
  'low', 'sodium',
  'pitted', 'juiced', 'halved', 'quartered', 'seeded', 'deseeded', 'stemmed', 'separated',
  'cut', 'into', 'inch', 'inches', 'cubes', 'pieces', 'chunks', 'strips', 'wedges', 'halves', 'thirds',
  'seeds', 'removed', 'stems', 'discarded', 'deveined', 'uncooked', 'cooked',
  'blanched', 'julienned', 'shaved', 'torn', 'smashed', 'pressed',
  'trimmed', 'cored', 'shredded', 'cubed', 'crumbled', 'zested', 'roughly',
  'finely', 'thinly', 'coarsely', 'lightly', 'firmly', 'loosely',
  'und', 'and', 'of', 'plus', 'extra', 'more', 'to', 'taste',
])

/** True wenn der Name NUR aus Qualifier-Wörtern besteht — Geister-Zeilen aus
 *  Komma-Splits ("1 cup butter, softened" → "softened") werden übersprungen. */
export function isQualifierOnly(name: string): boolean {
  const tokens = name
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0 && !/^\d+$/.test(t)) // nackte Zahlen zählen nicht
  return tokens.length > 0 && tokens.every((t) => QUALIFIERS.has(normalizeName(t)))
}

/**
 * Builds a Yazio search query from a parsed ingredient name: keep the first of
 * "X oder Y" alternatives and drop filler/qualifier words so the core product
 * term remains (e.g. "kleine reife Banane" → "Banane", "gemischte Beeren der
 * Saison" → "Beeren"). Falls back to the trimmed original if all words strip out.
 */
/** Drops purpose clauses — they are not part of the product name:
 *  "Öl zum Braten" → "Öl". Without this, FTS matches dishes/spreads whose
 *  NAME contains "zum Braten", and cache keys never repeat. */
export function stripPurpose(name: string): string {
  const stripped = name
    .replace(/\s+(?:zum|zur|für|fuer)\s+.+$/i, '')
    .replace(/\s+for\s+(?:frying|serving|garnish(?:ing)?|greasing|dusting|drizzling|brushing|the\s+pan|cooking)\b.*$/i, '')
    .trim()
  return stripped.length > 0 ? stripped : name
}

export function buildSearchQuery(name: string): string {
  const firstAlternative = name.split(/\s+(?:oder|bzw\.?|alternativ)\s+/i)[0] ?? name
  // Bindestrich-Präfixe überleben die Token-Filterung ("Bio-Zitrone")
  const dePrefixed = firstAlternative.replace(/\b(bio|baby|demeter|mini|tk|tiefkuehl|tiefkuhl|tiefkühl)-/gi, '')
  const kept = stripPurpose(dePrefixed)
    .split(/\s+/)
    .map((tok) => tok.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((tok) => tok.length > 0 && !QUALIFIERS.has(normalizeName(tok)))
  const query = kept.join(' ').trim()
  return query.length > 0 ? query : name.trim()
}

// Pure seasonings / spices to exclude from tracking (matched whole-word in
// normalizeName() form). Ambiguous foods (Paprika, Ingwer, Knoblauch, Zwiebel,
// Chili) are deliberately NOT here — only their unambiguous "…pulver" spice forms.
const SEASONINGS = new Set([
  // salt & pepper (incl. common compounds)
  'salz', 'meersalz', 'steinsalz', 'jodsalz', 'gewurzsalz', 'krautersalz',
  'pfeffer', 'pfefferkorn', 'pfefferkorner', 'cayennepfeffer',
  // generic
  'gewurz', 'gewurze', 'gewurzmischung', 'krauter',
  // unambiguous ground-spice forms of otherwise-ambiguous foods
  'paprikapulver', 'chilipulver', 'currypulver', 'knoblauchpulver', 'zwiebelpulver', 'ingwerpulver',
  // spices
  'muskat', 'muskatnuss', 'zimt', 'kurkuma', 'curry', 'kreuzkummel', 'kummel', 'koriander',
  'kardamom', 'piment', 'nelken', 'safran', 'anis', 'sternanis', 'wacholder', 'vanille',
  'lorbeer', 'lorbeerblatt', 'lorbeerblatter',
  // herbs
  'oregano', 'basilikum', 'thymian', 'rosmarin', 'majoran', 'salbei', 'petersilie',
  'schnittlauch', 'dill', 'estragon', 'kerbel', 'minze', 'pfefferminze', 'bohnenkraut', 'kresse',
  // Audit-Funde: Aroma-/Gewürzformen ohne relevante Kalorien
  'vanilleschote', 'vanilleschoten', 'koriandersaat', 'kardamomkapsel', 'kardamomkapseln',
  'kamillenblute', 'kamillenbluten', 'rosmarinnadeln', 'selleriesalz', 'knoblauchgranulat',
  'zitronenmelisse', 'melisse', 'zitronenschale', 'orangenschale', 'limettenschale',
  'beifuss', 'zitronenabrieb',
  'orangenabrieb', 'rauchsalz', 'gurkenwasser', 'spargelschalen', 'shisokresse',
  'zitronengras', 'lemongrass', 'currykraut', 'wacholderbeere', 'wacholderbeeren',
  'safranfaden', 'safranfäden', 'matcha',
  'matchapulver', 'daikonkresse', 'spargelsud', 'knoblauchsalz',
  'anisstern', 'gewurznelke', 'gewurznelken', 'vanillemark',
  'senfkorner', 'senfkoerner', 'blattpetersilie', 'brotgewurzmischung', 'brotgewurz',
  'rosenbluten', 'rosenblutenblatter', 'koriandergrun', 'kapuzinerkresse',
  'fenchelsaat', 'fenchelsamen', 'liebstockel', 'liebstoeckel', 'liebstockl', 'maggikraut',
  // Küchen-Utensilien, die als 'Zutat' gelistet werden
  'backpapier', 'alufolie', 'frischhaltefolie', 'zahnstocher', 'kuchengarn',
  'holzspiesse', 'holzspiesschen', 'muffinformchen', 'pergamentpapier',
  'holunderbluten', 'holunderblutendolden', 'markknochen', 'suppengrun',
  // englisch — 'pepper' bewusst NICHT solo (bell pepper = Gemüsepaprika!)
  'salt', 'peppercorn', 'peppercorns', 'cumin', 'parsley', 'cilantro',
  'basil', 'thyme', 'rosemary', 'sage', 'marjoram', 'nutmeg', 'cinnamon',
  'saffron', 'turmeric', 'cardamom', 'allspice', 'anise', 'cayenne',
])

// Prep notes whose amount is negligible and unknowable: greasing the tin,
// flouring the work surface, dusting. NOT "zum Braten/Ausbacken" — frying fat
// is largely consumed and belongs in the diary.
const PREP_NOTE = new RegExp(
  [
    'fur (die |das |eine )?(form|backform|kastenform|springform|kuchenform|muffinform|auflaufform|blech|backblech|pfanne|arbeitsflache|arbeitsplatte)',
    'zum (einfetten|ausfetten|befetten|fetten|bemehlen|bestauben|ausstauben|bestreuen der form)',
  ].join('|'),
)

/** True for negligible prep notes ("etwas Butter für die Form", "Mehl zum
 *  Bestäuben") — skipped like seasonings instead of defaulting to 100 g. */
export function isPrepNote(name: string): boolean {
  const n = normalizeName(name)
  // Alternativ-/Beispiel-Klauseln aus Komma-Splits ("such as serrano",
  // "z. B. Gouda") sind keine eigene Zutat
  if (/^(such as |like |z\.? ?b\.? |wie |etwa |idealerweise |am besten )/.test(n)) return true
  return PREP_NOTE.test(n)
}

// Gewürz-Komposita: <Gewürz> + Form ("Zimtstange", "Pimentkörner",
// "Thymianzweig", "Koriandergrün") — die Form trägt keine Kalorienrelevanz.
const SPICE_FORMS = [
  'korner', 'koerner', 'korn', 'stange', 'stangen', 'rinde', 'stangel',
  'staengel', 'zweig', 'zweige', 'grun', 'gruen', 'blatt', 'blatter',
  'blaetter', 'blattchen', 'blute', 'bluten', 'pulver', 'mischung', 'samen', 'saat',
]

/** True if the ingredient name is a pure seasoning/spice (any whole word matches
 *  the curated list). Ambiguous foods like "Paprika" or "Knoblauch" return false. */
export function isSeasoning(name: string): boolean {
  const normalized = normalizeName(name)
  // Currypaste/-sauce ist kalorisch relevant — nicht über das Token 'curry' skippen
  if (/\bcurry[ -]?(paste|sauce|soße|sosse)\b/.test(normalized)) return false
  // dill pickles sind Gewürzgurken, kein Dill-Kraut
  if (/\bdill pickles?\b/.test(normalized)) return false
  // mehrwortige englische Pfeffer-Formen (bare 'pepper' wäre bell pepper)
  if (/\b(black|white|ground|cracked) pepper\b/.test(normalized)) return true
  if (/\bbay (leaf|leaves)\b/.test(normalized)) return true
  if (/\b(kaffir|lime) leaves\b/.test(normalized)) return true
  if (/\bvanilla (extract|essence)\b/.test(normalized)) return true
  // Nicht-Buchstaben-Grenzen statt Whitespace: "Togarashi-Gewürz" → gewurz
  return normalized
    .split(/[^\p{L}\p{N}]+/u)
    .some((tok) => {
      if (SEASONINGS.has(tok)) return true
      // …gewürz/…pfeffer-Komposita sind immer Würzmittel (Brotgewürz,
      // Peperonigewürz, Zitronenpfeffer) — Gewürzgurke beginnt damit, endet nicht
      if (tok.length > 7 && (tok.endsWith('gewurz') || tok.endsWith('pfeffer') || tok.endsWith('salz') || tok.endsWith('abrieb') || tok.endsWith('sud'))) return true
      for (const form of SPICE_FORMS) {
        if (tok.length > form.length + 2 && tok.endsWith(form)) {
          const head = tok.slice(0, -form.length)
          if (SEASONINGS.has(head) || SEASONINGS.has(head.replace(/n$/, '')) || SEASONINGS.has(head + 'e')) return true
        }
      }
      return false
    })
}
