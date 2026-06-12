import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'
import { listUserTokens } from '../../modules/push/push.repo.js'

const BOOTSTRAP = 'test-bootstrap-token'

async function login(app: ReturnType<typeof buildApp>, username: string) {
  await app.inject({
    method: 'POST',
    url: '/api/auth/bootstrap',
    payload: { token: BOOTSTRAP, username, password: 'pw-123456' },
  })
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password: 'pw-123456' },
  })
  const { id, token } = res.json<{ id: string; token: string }>()
  return { id, headers: { authorization: `Bearer ${token}` } }
}

describe('push routes', () => {
  it('registers and unregisters a device token', async () => {
    const db = createTestDb()
    const app = buildApp(db)
    const { id, headers } = await login(app, 'pusher')

    const reg = await app.inject({
      method: 'POST',
      url: '/api/push/register',
      headers,
      payload: { token: 'a'.repeat(64), platform: 'ios' },
    })
    expect(reg.statusCode).toBe(204)
    expect(listUserTokens(db, id)).toHaveLength(1)

    const unreg = await app.inject({
      method: 'POST',
      url: '/api/push/unregister',
      headers,
      payload: { token: 'a'.repeat(64) },
    })
    expect(unreg.statusCode).toBe(204)
    expect(listUserTokens(db, id)).toHaveLength(0)
  })

  it('moves a token to the new account on re-login', async () => {
    const db = createTestDb()
    const app = buildApp(db)
    const first = await login(app, 'olduser')
    const second = await login(app, 'newuser')
    const token = 'b'.repeat(64)

    await app.inject({ method: 'POST', url: '/api/push/register', headers: first.headers, payload: { token } })
    await app.inject({ method: 'POST', url: '/api/push/register', headers: second.headers, payload: { token } })

    expect(listUserTokens(db, first.id)).toHaveLength(0)
    expect(listUserTokens(db, second.id)).toHaveLength(1)
  })

  it('requires auth', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({
      method: 'POST',
      url: '/api/push/register',
      payload: { token: 'c'.repeat(64) },
    })
    expect(res.statusCode).toBe(401)
  })
})
