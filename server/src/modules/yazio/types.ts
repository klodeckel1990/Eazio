// Mirrors the yazio library Token shape (src/types/auth.ts). Use the library's
// exported type instead if available; this local copy keeps us decoupled and
// is what we persist (encrypted) in yazio_accounts.encTokens.
export interface YazioToken {
  token_type: string
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at: number // epoch ms
}
