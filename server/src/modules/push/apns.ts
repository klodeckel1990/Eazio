// APNs-Versand über die HTTP/2-Provider-API mit token-basierter Auth:
// ES256-JWT aus dem .p8-Key des Developer-Portals (kein Zertifikats-Zirkus).
// Dev-Builds aus Xcode bekommen Sandbox-Tokens, TestFlight/App Store
// Produktions-Tokens — sendWithFallback probiert beide Umgebungen und meldet
// die funktionierende zurück, damit der Aufrufer sie am Token speichern kann.
import { readFileSync } from 'node:fs'
import { connect } from 'node:http2'
import { importPKCS8, SignJWT, type CryptoKey } from 'jose'
import { env } from '../../config/env.js'

export interface PushMessage {
  title: string
  body: string
}

export type ApnsEnv = 'prod' | 'sandbox'

export interface SendResult {
  ok: boolean
  status: number
  /** APNs-Fehlergrund, z. B. 'BadDeviceToken' oder 'Unregistered' (410). */
  reason: string | null
}

const HOSTS: Record<ApnsEnv, string> = {
  prod: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
}

export function pushConfigured(): boolean {
  return Boolean(env.APNS_KEY_PATH && env.APNS_KEY_ID)
}

// Apple verlangt Provider-Tokens zwischen 20 und 60 Minuten Alter — 50 min
// Cache hält uns sicher im Fenster und spart das Signieren pro Push.
let cached: { jwt: string; iat: number } | null = null
let signingKey: CryptoKey | null = null

async function providerJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cached && now - cached.iat < 50 * 60) return cached.jwt
  signingKey ??= await importPKCS8(readFileSync(env.APNS_KEY_PATH!, 'utf8'), 'ES256')
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env.APNS_KEY_ID! })
    .setIssuer(env.APNS_TEAM_ID)
    .setIssuedAt(now)
    .sign(signingKey)
  cached = { jwt, iat: now }
  return jwt
}

export async function sendApns(
  deviceToken: string,
  msg: PushMessage,
  apnsEnv: ApnsEnv,
): Promise<SendResult> {
  const jwt = await providerJwt()
  return new Promise((resolve, reject) => {
    const client = connect(HOSTS[apnsEnv])
    client.on('error', reject)
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': env.APNS_TOPIC,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    })
    let status = 0
    let body = ''
    req.setEncoding('utf8')
    req.on('response', (headers) => {
      status = Number(headers[':status'] ?? 0)
    })
    req.on('data', (chunk: string) => {
      body += chunk
    })
    req.on('end', () => {
      client.close()
      let reason: string | null = null
      try {
        reason = (JSON.parse(body) as { reason?: string }).reason ?? null
      } catch {
        // 200-Antworten haben keinen Body
      }
      resolve({ ok: status === 200, status, reason })
    })
    req.on('error', (err) => {
      client.close()
      reject(err)
    })
    req.end(JSON.stringify({ aps: { alert: { title: msg.title, body: msg.body }, sound: 'default' } }))
  })
}

export interface DeliveryResult extends SendResult {
  /** Umgebung, in der zugestellt wurde (zum Speichern am Token). */
  env: ApnsEnv
}

export async function sendWithFallback(
  deviceToken: string,
  msg: PushMessage,
  preferred: ApnsEnv | null,
): Promise<DeliveryResult> {
  const order: ApnsEnv[] = preferred === 'sandbox' ? ['sandbox', 'prod'] : ['prod', 'sandbox']
  let last: DeliveryResult | null = null
  for (const e of order) {
    const res = await sendApns(deviceToken, msg, e)
    last = { ...res, env: e }
    // Nur BadDeviceToken heißt "falsche Umgebung" — alles andere nicht erneut
    // versuchen (410 Unregistered, 400 BadTopic, … wären in beiden gleich).
    if (res.ok || res.reason !== 'BadDeviceToken') return last
  }
  return last!
}
