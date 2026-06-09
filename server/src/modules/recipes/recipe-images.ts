import path from 'node:path'
import os from 'node:os'
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { env } from '../../config/env.js'

// Images live next to the SQLite DB so they share the persistent /data volume.
const IMAGES_DIR = (() => {
  const p = env.DATABASE_PATH
  const base = p && p !== ':memory:' ? path.dirname(path.resolve(p)) : os.tmpdir()
  return path.join(base, 'recipe-images')
})()

const FETCH_TIMEOUT_MS = 12_000
const MAX_BYTES = 6_000_000
const UA = 'Mozilla/5.0 (compatible; EazioRecipeBot/1.0; +https://github.com/klodeckel1990/Eazio)'

function imagePath(recipeId: string): string {
  // recipeId is a server-generated UUID, safe to use as a filename.
  return path.join(IMAGES_DIR, recipeId)
}

/** Downloads a recipe image to the data volume. Returns its MIME type, or null on failure. */
export async function cacheRecipeImage(recipeId: string, url: string): Promise<string | null> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'user-agent': UA } })
    if (!res.ok) return null
    const mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    if (!mime.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null
    mkdirSync(IMAGES_DIR, { recursive: true })
    writeFileSync(imagePath(recipeId), buf)
    return mime
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function readRecipeImage(recipeId: string): Buffer | null {
  const p = imagePath(recipeId)
  try {
    return existsSync(p) ? readFileSync(p) : null
  } catch {
    return null
  }
}

export function deleteRecipeImage(recipeId: string): void {
  try {
    rmSync(imagePath(recipeId), { force: true })
  } catch {
    /* ignore */
  }
}
