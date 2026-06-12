// Plattformneutrale Zustellung an alle Geräte eines Nutzers: iOS-Tokens über
// APNs (mit Sandbox/Prod-Fallback), Android-Tokens über FCM. Tote Tokens
// (abgemeldet/App gelöscht) werden direkt aufgeräumt. Die send-Funktionen
// sind injizierbar (Tests) und fallen sonst auf die echten Sender zurück.
import type { FastifyBaseLogger } from 'fastify'
import type { DB } from '../../db/client.js'
import { pushConfigured, sendWithFallback, type ApnsEnv, type PushMessage } from './apns.js'
import { fcmConfigured, sendFcm } from './fcm.js'
import { listUserTokens, removeTokenById, setTokenEnv } from './push.repo.js'

export interface DeliverOpts {
  apns?: typeof sendWithFallback
  fcm?: typeof sendFcm
  log?: FastifyBaseLogger
}

export function anyPushConfigured(): boolean {
  return pushConfigured() || fcmConfigured()
}

/** true, wenn mindestens ein Gerät die Nachricht bekommen hat. */
export async function deliverToUser(
  db: DB,
  userId: string,
  msg: PushMessage,
  opts: DeliverOpts = {},
): Promise<boolean> {
  let delivered = false
  for (const t of listUserTokens(db, userId)) {
    try {
      if (t.platform === 'ios') {
        if (!opts.apns && !pushConfigured()) continue
        const send = opts.apns ?? sendWithFallback
        const res = await send(t.token, msg, t.apnsEnv as ApnsEnv | null)
        if (res.ok) {
          delivered = true
          if (t.apnsEnv !== res.env) setTokenEnv(db, t.id, res.env)
        } else if (res.status === 410 || res.reason === 'BadDeviceToken') {
          removeTokenById(db, t.id)
        } else {
          opts.log?.warn({ status: res.status, reason: res.reason }, 'apns delivery failed')
        }
      } else if (t.platform === 'android') {
        if (!opts.fcm && !fcmConfigured()) continue
        const send = opts.fcm ?? sendFcm
        const res = await send(t.token, msg)
        if (res.ok) {
          delivered = true
        } else if (res.status === 404 || res.reason === 'UNREGISTERED') {
          removeTokenById(db, t.id)
        } else {
          opts.log?.warn({ status: res.status, reason: res.reason }, 'fcm delivery failed')
        }
      }
    } catch (err) {
      opts.log?.warn({ err, platform: t.platform }, 'push send error')
    }
  }
  return delivered
}
