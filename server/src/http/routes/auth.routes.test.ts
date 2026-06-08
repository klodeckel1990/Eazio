import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE } from '../../modules/auth/sessions.js'

const BOOTSTRAP = 'test-bootstrap-token' // = test/setup.ts ADMIN_BOOTSTRAP

async function bootstrap(app: ReturnType<typeof buildApp>, username = 'jens', password = 'pw-123456') {
  return app.inject({
    method: 'POST',
    url: '/api/auth/bootstrap',
    payload: { token: BOOTSTRAP, username, password },
  })
}

describe('auth routes', () => {
  it('rejects bootstrap with a wrong token', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { token: 'nope', username: 'x', password: 'pw-123456' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('creates a user, logs in, reads me, logs out', async () => {
    const app = buildApp(createTestDb())

    const created = await bootstrap(app)
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ username: 'jens' })

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'jens', password: 'pw-123456' },
    })
    expect(login.statusCode).toBe(200)
    const cookie = login.cookies.find((c) => c.name === SESSION_COOKIE)
    expect(cookie).toBeTruthy()
    const cookieHeader = `${SESSION_COOKIE}=${cookie!.value}`

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookieHeader } })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ username: 'jens' })

    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: cookieHeader } })
    expect(logout.statusCode).toBe(204)

    const meAfter = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookieHeader } })
    expect(meAfter.statusCode).toBe(401)
  })

  it('rejects login with a wrong password', async () => {
    const app = buildApp(createTestDb())
    await bootstrap(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'jens', password: 'WRONG' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects bootstrap for a duplicate username', async () => {
    const app = buildApp(createTestDb())
    await bootstrap(app)
    const dup = await bootstrap(app)
    expect(dup.statusCode).toBe(409)
  })

  it('rejects bootstrap with a too-short password (validation -> 400)', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { token: BOOTSTRAP, username: 'shorty', password: '1234567' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('logout without a cookie is a no-op 204', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' })
    expect(res.statusCode).toBe(204)
  })

  it('rejects a tampered session cookie on /me', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `${SESSION_COOKIE}=not-a-valid-signed-value` },
    })
    expect(res.statusCode).toBe(401)
  })
})
