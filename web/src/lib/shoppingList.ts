import type { RecipeIngredient, ShoppingListFormat } from '../api/types'

export const SHOPPING_FORMAT_LABEL: Record<ShoppingListFormat, string> = {
  plain: 'Klartext',
  checklist: 'Abhakbare Liste',
  bring: 'Bring!',
}

const line = (ing: RecipeIngredient): string =>
  [ing.quantity, ing.unit, ing.name].map((p) => p.trim()).filter(Boolean).join(' ')

/**
 * Clipboard text for the `plain` / `checklist` formats: a "🛒 Titel" header
 * plus one clean ingredient line each. No checkbox prefix — Apple Notes can't
 * turn pasted text into a native checklist anyway; clean lines let the user
 * select-all and tap the Notes checklist button to convert them in one step.
 */
export function buildShoppingText(title: string, ingredients: RecipeIngredient[]): string {
  const lines = ingredients.map(line).filter(Boolean).join('\n')
  const header = title.trim() ? `🛒 ${title.trim()}\n\n` : ''
  return header + lines
}

/**
 * Builds the Bring! web-to-app deeplink. Bring fetches `publicUrl` server-side
 * and parses its schema.org/Recipe JSON-LD. baseQuantity/requestedQuantity let
 * Bring scale; we keep them 1:1 with the recipe's servings (default 4).
 */
export function bringDeeplink(publicUrl: string, servings: number | null): string {
  const qty = servings && servings > 0 ? servings : 4
  const params = new URLSearchParams({
    url: publicUrl,
    source: 'web',
    baseQuantity: String(qty),
    requestedQuantity: String(qty),
  })
  return `https://api.getbring.com/rest/bringrecipes/deeplink?${params.toString()}`
}

/** Copies text to the clipboard, with a hidden-textarea fallback for old WebViews. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
