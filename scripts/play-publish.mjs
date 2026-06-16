#!/usr/bin/env node
// Lädt das signierte Release-AAB per Google Play Developer API (AndroidPublisher
// v3 Edits) auf einen Track — das Android-Gegenstück zu `altool` für iOS.
// Dependency-frei: Service-Account-JWT (RS256) -> OAuth2-Token -> Edits-API.
//
// Usage:  node scripts/play-publish.mjs [track] [aabPath]
//   track:   internal (Default) | alpha | beta | production
//   aabPath: Default app/android/app/build/outputs/bundle/release/app-release.aab
// Key:      ~/.tellerwert/play-sa.json (Service-Account, gitignored)
import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'

const PKG = 'de.tellerwert.app'
const TRACK = process.argv[2] || 'internal'
const AAB = process.argv[3] || 'app/android/app/build/outputs/bundle/release/app-release.aab'
const KEY_PATH = `${process.env.HOME}/.tellerwert/play-sa.json`
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3'
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3'

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

async function accessToken() {
  const sa = JSON.parse(readFileSync(KEY_PATH, 'utf8'))
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const signingInput = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`
  const sig = crypto.sign('RSA-SHA256', Buffer.from(signingInput), sa.private_key)
  const jwt = `${signingInput}.${b64url(sig)}`
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`token: ${r.status} ${JSON.stringify(j)}`)
  return j.access_token
}

async function api(token, method, url, body, contentType = 'application/json') {
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': contentType } : {}) },
    body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body,
  })
  const txt = await r.text()
  let j = null
  try { j = txt ? JSON.parse(txt) : null } catch {}
  if (!r.ok) throw new Error(`${method} ${url.replace(/applications\/[^/]+/, 'applications/…')}: ${r.status} ${txt.slice(0, 400)}`)
  return j
}

const token = await accessToken()
console.log(`Authentifiziert. Lade ${path.basename(AAB)} → Track "${TRACK}" (${PKG})`)

const edit = await api(token, 'POST', `${API}/applications/${PKG}/edits`)
const editId = edit.id
console.log(`Edit ${editId} angelegt`)

const aabBytes = readFileSync(AAB)
const up = await api(token, 'POST', `${UPLOAD}/applications/${PKG}/edits/${editId}/bundles?uploadType=media`, aabBytes, 'application/octet-stream')
console.log(`AAB hochgeladen: versionCode ${up.versionCode} (sha1 ${String(up.sha1).slice(0, 12)}…)`)

await api(token, 'PUT', `${API}/applications/${PKG}/edits/${editId}/tracks/${TRACK}`, {
  track: TRACK,
  releases: [{ status: 'completed', versionCodes: [String(up.versionCode)] }],
})
console.log(`Track "${TRACK}" auf versionCode ${up.versionCode} gesetzt`)

const committed = await api(token, 'POST', `${API}/applications/${PKG}/edits/${editId}:commit`)
console.log(`✅ Committet (Edit ${committed.id}). Build steht im Track "${TRACK}" bereit.`)
