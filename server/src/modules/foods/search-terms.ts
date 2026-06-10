// Builds the search_terms column feeding the foods_fts index. The FTS tokenizer
// (unicode61 remove_diacritics 2) already matches "Musli" → "Müsli"; what it
// cannot do is the German ue/oe/ae transliteration ("muesli") or splitting
// compounds ("vollkornbrot" when the user types "brot"), so those variants are
// materialized here at write time.

const UMLAUT_MAP: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

// Common food-compound heads: a token ending in one of these is additionally
// indexed as the bare head ("kalbslende" → "lende"). Curated, not linguistic.
const COMPOUND_HEADS = [
  'aufstrich', 'auflauf', 'beere', 'bohne', 'braten', 'brot', 'broetchen',
  'butter', 'creme', 'eis', 'erbse', 'essig', 'filet', 'flocken', 'fleisch',
  'gemuese', 'joghurt', 'kaese', 'kartoffel', 'keule', 'kohl', 'kuchen',
  'kuerbis', 'lende', 'marmelade', 'mehl', 'melone', 'milch', 'mus', 'nudel',
  'nudeln', 'nuss', 'oel', 'paprika', 'pilz', 'pulver', 'quark', 'reis',
  'kotelett', 'saft', 'salat', 'sauce', 'schinken', 'schnitzel', 'sosse',
  'speck', 'spinat', 'suppe', 'tomate', 'traube', 'wurst', 'zucker', 'zwiebel',
]

/**
 * Zero-hit fallback: for a compound the index does not know ("Romatomaten"),
 * return the bare head ("tomate") as a retry query — the AI rerank then picks
 * the fitting base product among the head's results.
 */
export function compoundHeadFallback(name: string): string | null {
  for (const token of tokenize(name)) {
    const folded = foldGerman(token)
    const variants = [folded, ...depluralize(folded)]
    for (const v of variants) {
      for (const head of COMPOUND_HEADS) {
        if (v.length > head.length + 2 && v.endsWith(head)) return head
      }
    }
  }
  return null
}

// Colloquial names → what the BLS actually calls the product. Matched against
// the folded food name at index time; the extra terms land in search_terms.
const NAME_SYNONYMS: { match: RegExp; terms: string }[] = [
  { match: /koerniger frischkaese|huettenkaese/, terms: 'huettenkaese hüttenkäse cottage cheese koerniger frischkaese' },
  { match: /fruehlingszwiebel/, terms: 'lauchzwiebel jungzwiebel' },
  { match: /\bhaferdrink/, terms: 'hafermilch pflanzendrink pflanzenmilch' },
  { match: /\bsojadrink/, terms: 'sojamilch' },
  { match: /\bmandeldrink/, terms: 'mandelmilch' },
  { match: /speisequark/, terms: 'quark magerquark' },
  { match: /moehre|karotte/, terms: 'moehre möhre karotte wurzel' },
  { match: /gemuesepaprika/, terms: 'spitzpaprika paprika paprikaschote paprikaschoten schote' },
  { match: /^tomate roh$/, terms: 'kirschtomate cherrytomate cocktailtomate cherry romatomate' },
  { match: /^rind hackfleisch/, terms: 'rinderhack rinderhackfleisch hackfleisch hack' },
  { match: /^speisezwiebel/, terms: 'zwiebel zwiebeln' },
  { match: /^huehnerei/, terms: 'ei eier' },
  { match: /^eier gekocht/, terms: 'ei' },
  // BLS 4.0 kennt keine Vollmilch — die Trinkmilch-Einträge sichtbar machen
  { match: /^milch (fettarm|entrahmt)/, terms: 'vollmilch kuhmilch trinkmilch frischmilch' },
  { match: /zuckermais/, terms: 'mais' },
  { match: /paprikaschote/, terms: 'paprika' },
  // Audit-Funde (einfachkochen.de): BLS-Namen, die niemand so tippt
  { match: /^pfefferschote/, terms: 'chili chilli chilischote thaichili thaichilli peperoni' },
  { match: /^knoblauch roh/, terms: 'knoblauchzehe knoblauchzehen zehe' },
  { match: /^schlagsahne/, terms: 'sahne schlagobers' },
  { match: /^trinkwasser/, terms: 'wasser leitungswasser' },
  { match: /^schwein hackfleisch/, terms: 'schweinehack schweinehackfleisch hackfleisch' },
  { match: /hackfleisch gemischt/, terms: 'hackfleisch gemischtes hack' },
  { match: /^frischkaesezubereitung/, terms: 'frischkaese doppelrahmfrischkaese' },
  { match: /kuvertuere/, terms: 'kuvertuere zartbitterkuvertuere vollmilchkuvertuere schokoglasur' },
  { match: /^backhefe/, terms: 'hefe trockenhefe frischhefe' },
  { match: /^champignon roh/, terms: 'pilz pilze champignons' },
  { match: /^kuerbis hokkaido/, terms: 'hokkaidokuerbis hokkaido' },
  { match: /^kuerbis butternut/, terms: 'butternutkuerbis butternusskuerbis butternut' },
  // Audit v2 (Top-10-Rezeptseiten): farbliche Varianten + fehlende Begriffe
  { match: /^kopfsalat roh/, terms: 'salatblatt salatblaetter blattsalat lettuce' },
  { match: /^joghurt mild/, terms: 'naturjoghurt yogurt yoghurt' },
  { match: /^tomaten geschaelt/, terms: 'tomatenstuecke dosentomaten' },
  { match: /^spinat roh/, terms: 'blattspinat babyspinat spinach' },
  { match: /^linse rot reif/, terms: 'rote linsen red lentils' },
  { match: /^weizentoastbrot/, terms: 'toastbrot toast' },
  { match: /^zartbitter-\/halbbitterschokolade$/, terms: 'zartbitterschokolade schokoraspel raspelschokolade dunkle schokolade dark chocolate chips' },
  { match: /^kidneybohne/, terms: 'kidney beans kidneybohnen' },
  // englische Staples (Allrecipes/Serious Eats/Cookpad — KI-Retry trifft sonst nur OFF)
  { match: /^huehnerei/, terms: 'ei eier egg eggs' },
  { match: /^weizen mehl/, terms: 'flour allpurpose' },
  { match: /^zucker weiss/, terms: 'sugar' },
  { match: /^knoblauch roh/, terms: 'knoblauchzehe knoblauchzehen zehe garlic' },
  { match: /^tomate roh$/, terms: 'kirschtomate cherrytomate cocktailtomate cherry romatomate tomato tomatoes' },
  { match: /^rind hackfleisch/, terms: 'rinderhack rinderhackfleisch hackfleisch hack ground beef' },
  { match: /^haehnchenbrustfilet|^haehnchen brust/, terms: 'chicken breast haehnchenbrust' },
  { match: /^schlagsahne/, terms: 'sahne schlagobers cream whipping heavy' },
  { match: /^trinkwasser/, terms: 'wasser leitungswasser water' },
  { match: /^walnuss/, terms: 'walnut walnuts walnuesse' },
  { match: /^banane roh/, terms: 'banana bananas' },
  { match: /^buttermilch/, terms: 'buttermilk' },
  { match: /^pfefferschote/, terms: 'chile chiles peppers green' },
  { match: /^speisezwiebel/, terms: 'rot rote onion onions' },
  { match: /^milch (fettarm|entrahmt)/, terms: 'milk' },
  { match: /^butter (mild|gesalzen)/, terms: 'unsalted salted' },
  // Audit v2 Batch 2
  { match: /^wirsing/, terms: 'wirsingkohl' },
  { match: /^zuckererbse/, terms: 'zuckerschote zuckerschoten kaiserschote kaiserschoten' },
  { match: /^pistazie/, terms: 'pistazien pistazienkerne' },
  { match: /^weinessig/, terms: 'weissweinessig rotweinessig' },
  { match: /^reis parboiled/, terms: 'basmatireis basmati' },
  { match: /^kartoffel (geschaelt|ungeschaelt), roh/, terms: 'kartoffeln fruehkartoffeln' },
  // Audit v3
  { match: /^broccoli/, terms: 'brokkoli' },
  { match: /^lachs roh$/, terms: 'lachsfilet lachskotelett lachssteak salmon' },
  { match: /^sojasauce/, terms: 'soy sauce teriyaki' },
  { match: /^teigwaren eifrei, roh$/, terms: 'nudeln nudel pasta spaghetti fusilli penne makkaroni spirelli' },
  { match: /^rind filet\/lende, roh/, terms: 'rinderfilet beef filet' },
  { match: /^schwein bauch \(wie gewachsen\) roh/, terms: 'schweinebauch pork belly' },
  { match: /^zucker braun/, terms: 'brauner zucker rohrzucker brown sugar' },
  { match: /^haehnchen (ober|unter)schenkel, mit haut, roh/, terms: 'haehnchenschenkel haehnchenkeule chicken thigh thighs' },
  { match: /^schwein kochschinken/, terms: 'gekochter schinken kochschinken ham' },
  // Audit v4
  { match: /^erbse gruen/, terms: 'erbsen peas tk-erbsen' },
  { match: /^paniermehl/, terms: 'bread crumbs breadcrumbs semmelbroesel' },
  { match: /^senf mittelscharf/, terms: 'mustard' },
  { match: /^teigwaren eifrei, roh$/, terms: 'fettuccine tagliatelle bandnudeln linguine' },
  { match: /^suesskirsche/, terms: 'kirsche kirschen cherry cherries' },
  { match: /^austernpilz/, terms: 'kraeuterseitling kraeuterseitlinge seitling seitlinge' },
  { match: /^pak choi/, terms: 'pakchoi bok choy bokchoy' },
  { match: /^sardelle/, terms: 'anchovy anchovies anchovis' },
  { match: /^schwein filet\/lende, roh/, terms: 'schweinefilet pork tenderloin' },
  { match: /^mandel suess$/, terms: 'mandeln mandelkerne almonds' },
  { match: /^feta mind/, terms: 'feta schafskaese' },
  { match: /^obstbrand/, terms: 'kirschwasser obstler williams' },
  { match: /^reis poliert/, terms: 'rice weisser reis white langkornreis' },
  // Audit v5 (englisch)
  { match: /^bleichsellerie/, terms: 'stangensellerie staudensellerie celery' },
  { match: /^knollensellerie/, terms: 'sellerie celeriac' },
  { match: /^erbse gruen, tiefgefroren/, terms: 'green frozen' },
  { match: /gemuesepaprika/, terms: 'bell pepper red green yellow' },
  { match: /^backhefe/, terms: 'yeast instant' },
  { match: /^haehnchen brustfilet, roh/, terms: 'chicken breast haehnchenbrust huehnerbrust' },
  { match: /^kartoffel (geschaelt|ungeschaelt), roh/, terms: 'potato potatoes russet' },
  { match: /^roemischer salat/, terms: 'roemersalat romana roemersalatherzen salatherzen romaine' },
  { match: /^teigwaren eifrei, roh$/, terms: 'rigatoni farfalle' },
  { match: /^blaetterteig eifrei/, terms: 'filoteig yufkateig strudelteig filoteigplatten tk-blaetterteig' },
  { match: /^lamm kotelett/, terms: 'lammkarree karree lammkoteletts' },
  { match: /^obstbrand/, terms: 'himbeergeist birnengeist' },
  { match: /bratwurst-grundbraet|^bratwurst/, terms: 'bratwurstbraet braet' },
  { match: /^gouda 48/, terms: 'goudakaese gouda' },
  { match: /^kokos fruchtfleisch, geraspelt/, terms: 'kokosraspel kokosraspeln kokosflocken' },
  { match: /^rind gulasch/, terms: 'rindergulasch gulasch beef stew meat schmorfleisch' },
  { match: /^tahin/, terms: 'tahini sesammus sesampaste' },
  { match: /^rindfleischbruehe/, terms: 'rinderbruehe beef broth stock' },
]

export function foldGerman(text: string): string {
  return text.toLowerCase().replace(/[äöüß]/g, (c) => UMLAUT_MAP[c] ?? c)
}

/** German plural → singular guesses for a folded token ("zwiebeln" → "zwiebel").
 *  Prefix search only matches index tokens that START with the query token, so
 *  a plural query never finds the singular name without these variants. */
function depluralize(token: string): string[] {
  const out: string[] = []
  if (token.length >= 6 && token.endsWith('en')) out.push(token.slice(0, -2))
  if (token.length >= 5 && /[ens]$/.test(token)) out.push(token.slice(0, -1))
  return out
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    // single digits stay: "Joghurt 3,5%" → joghurt, 3, 5 — the fat percentage
    // is exactly what distinguishes the plain product from compounds
    .filter((t) => t.length > 1 || /^\d$/.test(t))
}

/** Variants for one token: ue/oe/ae transliteration + compound-head split. */
function variants(token: string): string[] {
  const out = new Set<string>()
  const folded = foldGerman(token)
  if (folded !== token) out.add(folded)
  for (const head of COMPOUND_HEADS) {
    if (folded.length > head.length + 2 && folded.endsWith(head)) {
      out.add(head)
      out.add(folded.slice(0, folded.length - head.length))
      break
    }
  }
  return [...out]
}

/** Extra index terms for a food name (and optional brand); deduplicated, may be empty. */
export function buildSearchTerms(name: string, brand?: string | null): string {
  const terms = new Set<string>()
  for (const token of tokenize(name)) for (const v of variants(token)) terms.add(v)
  if (brand) for (const token of tokenize(brand)) for (const v of variants(token)) terms.add(v)
  // BLS writes many compounds as separate words ("Hafer Flocken", "Müsli-Riegel"
  // splits on the hyphen) — index the joined form so "haferflocken" matches.
  const head = name.split(',')[0] ?? name
  const headTokens = tokenize(head)
  if (headTokens.length >= 2 && headTokens.length <= 3) {
    terms.add(headTokens.map(foldGerman).join(''))
  }
  const folded = foldGerman(name)
  for (const syn of NAME_SYNONYMS) {
    if (syn.match.test(folded)) for (const t of syn.terms.split(' ')) terms.add(t)
  }
  return [...terms].join(' ')
}

/**
 * Turns user input into an FTS5 query. Per token, the exact term and the
 * prefix form are OR-ed (documents matching exactly hit both alternatives and
 * rank above prefix-only compound matches), plus the German transliteration
 * variant so "muesli" finds "Müsli" and vice versa. Groups are AND-ed —
 * FTS5 rejects implicit AND between parenthesized expressions.
 */
export function buildFtsQuery(input: string): string | null {
  const tokens = tokenize(input).slice(0, 6)
  if (tokens.length === 0) return null
  const parts = tokens.map((t) => {
    const exact = (s: string) => `"${s.replace(/"/g, '')}"`
    const prefix = (s: string) => `${exact(s)}*`
    const folded = foldGerman(t)
    const variants = new Set<string>([t, folded, ...depluralize(t), ...depluralize(folded)])
    // Soße/Sauce-Schreibweisen gegenseitig auffindbar machen
    if (folded.includes('sosse')) variants.add(folded.replace('sosse', 'sauce'))
    if (folded.includes('sauce')) variants.add(folded.replace('sauce', 'sosse'))
    const alts: string[] = []
    for (const v of variants) {
      alts.push(exact(v), prefix(v))
    }
    return `(${alts.join(' OR ')})`
  })
  return parts.join(' AND ')
}
