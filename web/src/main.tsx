import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { initTheme } from './lib/theme'
import { initKeyboard } from './lib/keyboard'

initTheme() // Erscheinungsbild vor dem ersten Paint auflösen
initKeyboard() // WebView-Resize + Tabbar ausblenden, solange die Tastatur offen ist

// Auto-updating service worker (precached shell + offline read caches).
// Only on http(s): inside the Capacitor shell (capacitor:// scheme) service
// workers are unsupported and registration breaks the boot. Dynamic import
// keeps every SW byte out of the native startup path.
if (location.protocol === 'http:' || location.protocol === 'https:') {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
