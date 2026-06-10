import type { ServingDef } from './foods.repo.js'

// BLS has no serving data, so common piece weights are curated here and
// attached as servingsJson during import. Keys are EXACT BLS 4.0 names —
// verify against the seed when bumping the BLS version. Weights follow the
// usual German portion references (mittelgroßes Stück, edible part).
const ST = (grams: number): ServingDef[] => [{ label: 'Stück', grams }]

export const PIECE_SERVINGS: Record<string, ServingDef[]> = {
  // Obst
  'Banane roh': ST(120),
  'Apfel roh': ST(150),
  'Birne roh': ST(150),
  'Orange roh': ST(150),
  'Mandarine roh': ST(70),
  'Kiwi roh': ST(75),
  'Pfirsich roh': ST(150),
  'Nektarine roh': ST(140),
  'Avocado roh': ST(140),
  'Zitrone roh': ST(60),
  'Erdbeere roh': ST(12),
  'Dattel getrocknet': ST(8),

  // Gemüse & Salat
  'Tomate roh': ST(100),
  'Gurke roh': ST(400),
  'Gemüsepaprika rot, roh': ST(150),
  'Gemüsepaprika grün, roh': ST(150),
  'Gemüsepaprika gelb, roh': ST(150),
  'Speisezwiebel roh': ST(90),
  'Knoblauch roh': [{ label: 'Zehe', grams: 3 }],
  'Karotte/Möhre, roh': ST(80),
  'Kartoffel geschält, roh': ST(90),
  'Kartoffel ungeschält, roh': ST(90),
  'Frühlingszwiebel/Lauchzwiebel, roh': ST(15),
  'Radieschen roh': [
    { label: 'Stück', grams: 10 },
    { label: 'Bund', grams: 120 },
  ],
  'Zucchini roh': ST(200),
  'Aubergine roh': ST(250),
  'Champignon roh': ST(20),
  'Kopfsalat roh': [{ label: 'Kopf', grams: 300 }],
  'Eisbergsalat roh': [{ label: 'Kopf', grams: 500 }],

  // Eier
  'Hühnerei roh': ST(60),
  'Hühnerei gekocht': ST(60),

  // Brot & Backwaren
  'Weizenbrötchen': ST(60),
  'Vollkornbrot': [{ label: 'Scheibe', grams: 50 }],
  'Roggenbrot': [{ label: 'Scheibe', grams: 45 }],
  'Weizenmischbrot': [{ label: 'Scheibe', grams: 45 }],
  'Roggenmischbrot': [{ label: 'Scheibe', grams: 45 }],
  'Weizenbrot/Weißbrot': [{ label: 'Scheibe', grams: 40 }],
  'Weizentoastbrot': [{ label: 'Scheibe', grams: 25 }],
  'Weizenvollkorntoastbrot': [{ label: 'Scheibe', grams: 25 }],
  'Weizenmischtoastbrot': [{ label: 'Scheibe', grams: 25 }],

  // Sonstiges
  'Mozzarella mind. 45 % Fett i. Tr.': [{ label: 'Kugel', grams: 125 }],
  'Wiener Würstchen': ST(50),
}
