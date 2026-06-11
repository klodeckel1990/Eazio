// iOS-Tastatur: resize "none" — die WebView bleibt voll groß (kein globales
// Relayout, kein Ruckeln). Stattdessen meldet das Keyboard-Plugin die Höhe,
// die als --kb-h auf <html> landet; Bottom-Sheets schieben sich damit exakt
// über die Tastatur. .kb-open markiert den offenen Zustand fürs CSS.
// Dynamischer Import wie beim Barcode-Scanner: kein Byte davon im Web-Bundle.

import { isNativeApp } from './barcode'

export function initKeyboard(): void {
  if (!isNativeApp()) return
  void import('@capacitor/keyboard').then(({ Keyboard }) => {
    void Keyboard.addListener('keyboardWillShow', (info) => {
      document.documentElement.style.setProperty('--kb-h', `${info.keyboardHeight}px`)
      document.documentElement.classList.add('kb-open')
    })
    void Keyboard.addListener('keyboardWillHide', () => {
      document.documentElement.style.setProperty('--kb-h', '0px')
      document.documentElement.classList.remove('kb-open')
    })
  })
}
