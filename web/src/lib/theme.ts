// Erscheinungsbild: System folgen (Standard) oder manuell Hell/Dunkel.
// JS löst die Präferenz zu einem effektiven Theme auf und setzt
// document.documentElement[data-theme] — das CSS kennt nur EINEN
// Dark-Override-Block, keine doppelten Media-Query-Paletten.

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'eazio.theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function themePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function setThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* restricted storage */
  }
  apply()
}

function apply(): void {
  const pref = themePref()
  const dark = pref === 'dark' || (pref === 'system' && media().matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  // Browser-Chrome (PWA/Safari) färbt mit
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#181d1a' : '#fbf6ee')
  // native Controls (Select-Picker, Tastatur, Scrollbars) folgen sonst dem
  // SYSTEM-Schema statt der App-Einstellung → helle Picker, helle Schrift
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute('content', dark ? 'dark' : 'light')
}

let wired = false
export function initTheme(): void {
  apply()
  if (wired) return
  wired = true
  media().addEventListener('change', () => {
    if (themePref() === 'system') apply()
  })
}
