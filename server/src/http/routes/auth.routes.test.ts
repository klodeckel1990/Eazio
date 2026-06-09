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

  it('registers a new user, sets a session, and reads me', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'newbie', email: 'New@Example.COM', password: 'pw-123456' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ username: 'newbie' })
    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE)
    expect(cookie).toBeTruthy()
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `${SESSION_COOKIE}=${cookie!.value}` },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ username: 'newbie' })
  })

  it('rejects registration for a duplicate username', async () => {
    const app = buildApp(createTestDb())
    const payload = { username: 'dup', email: 'a@example.com', password: 'pw-123456' }
    expect((await app.inject({ method: 'POST', url: '/api/auth/register', payload })).statusCode).toBe(201)
    const dup = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { ...payload, email: 'b@example.com' },
    })
    expect(dup.statusCode).toBe(409)
    expect(dup.json()).toMatchObject({ error: 'username_taken' })
  })

  it('rejects registration for a duplicate email (case-insensitive)', async () => {
    const app = buildApp(createTestDb())
    const payload = { username: 'one', email: 'same@example.com', password: 'pw-123456' }
    expect((await app.inject({ method: 'POST', url: '/api/auth/register', payload })).statusCode).toBe(201)
    const dup = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'two', email: 'SAME@example.com', password: 'pw-123456' },
    })
    expect(dup.statusCode).toBe(409)
    expect(dup.json()).toMatchObject({ error: 'email_taken' })
  })

  it('rejects registration with an invalid email or short password (400)', async () => {
    const app = buildApp(createTestDb())
    const badEmail = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'bademail', email: 'not-an-email', password: 'pw-123456' },
    })
    expect(badEmail.statusCode).toBe(400)
    const shortPw = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'shortpw', email: 'ok@example.com', password: '1234567' },
    })
    expect(shortPw.statusCode).toBe(400)
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

  it('issues a bearer token on login that works on /me and dies on logout', async () => {
    const app = buildApp(createTestDb())
    await bootstrap(app)

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'jens', password: 'pw-123456', deviceName: 'iPhone', platform: 'ios' },
    })
    expect(login.statusCode).toBe(200)
    const { token } = login.json() as { token: string }
    expect(token).toMatch(/^eaz_/)
    const auth = { authorization: `Bearer ${token}` }

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ username: 'jens' })

    expect((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: auth })).statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth })).statusCode).toBe(401)
  })

  it('returns a bearer token on registration', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'tokenuser', email: 'token@example.com', password: 'pw-123456', platform: 'web' },
    })
    expect(res.statusCode).toBe(201)
    const { token } = res.json() as { token: string }
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ username: 'tokenuser' })
  })

  it('rejects an invalid bearer token on /me', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: 'Bearer eaz_definitely-not-valid' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('lists sessions and revokes another device', async () => {
    const app = buildApp(createTestDb())
    await bootstrap(app)
    const loginAs = (deviceName: string, platform: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'jens', password: 'pw-123456', deviceName, platform },
      })
    const phone = (await loginAs('iPhone', 'ios')).json() as { token: string }
    const web = (await loginAs('Web', 'web')).json() as { token: string }
    const webAuth = { authorization: `Bearer ${web.token}` }

    const list = await app.inject({ method: 'GET', url: '/api/auth/sessions', headers: webAuth })
    expect(list.statusCode).toBe(200)
    const devices = list.json() as { id: string; deviceName: string }[]
    expect(devices).toHaveLength(2)

    const phoneSession = devices.find((d) => d.deviceName === 'iPhone')!
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/auth/sessions/${phoneSession.id}`,
      headers: webAuth,
    })
    expect(del.statusCode).toBe(204)

    // The phone's token is dead, the web token still works.
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${phone.token}` } }))
        .statusCode,
    ).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: webAuth })).statusCode).toBe(200)
  })

  it("cannot revoke another user's session", async () => {
    const app = buildApp(createTestDb())
    await bootstrap(app, 'usera')
    await bootstrap(app, 'userb')
    const login = (username: string) =>
      app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password: 'pw-123456' } })
    const a = (await login('usera')).json() as { token: string }
    const b = (await login('userb')).json() as { token: string }

    const aSessions = (
      await app.inject({ method: 'GET', url: '/api/auth/sessions', headers: { authorization: `Bearer ${a.token}` } })
    ).json() as { id: string }[]

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/auth/sessions/${aSessions[0]!.id}`,
      headers: { authorization: `Bearer ${b.token}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('requires auth for the session list', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({ method: 'GET', url: '/api/auth/sessions' })
    expect(res.statusCode).toBe(401)
  })
})
