// iOS-Tastatur: mit @capacitor/keyboard (resize: native) schrumpft die WebView,
// sodass Bottom-Sheets über der Tastatur sitzen. Solange die Tastatur offen
// ist, markiert .kb-open das <html> — CSS blendet damit die Tabbar aus.
// Dynamischer Import wie beim Barcode-Scanner: kein Byte davon im Web-Bundle.

import { isNativeApp } from './barcode'

export function initKeyboard(): void {
  if (!isNativeApp()) return
  void import('@capacitor/keyboard').then(({ Keyboard }) => {
    void Keyboard.addListener('keyboardWillShow', () => {
      document.documentElement.classList.add('kb-open')
    })
    void Keyboard.addListener('keyboardWillHide', () => {
      document.documentElement.classList.remove('kb-open')
    })
  })
}
