import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyCredentials = vi.fn()
vi.mock('../../modules/yazio/client.js', () => ({
  verifyCredentials: (c: unknown) => verifyCredentials(c),
}))

import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE } from '../../modules/auth/sessions.js'

const BOOTSTRAP = 'test-bootstrap-token'

async function authedApp() {
  const app = buildApp(createTestDb())
  await app.inject({
    method: 'POST', url: '/api/auth/bootstrap',
    payload: { token: BOOTSTRAP, username: 'jens', password: 'pw-123456' },
  })
  const login = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { username: 'jens', password: 'pw-123456' },
  })
  const c = login.cookies.find((x) => x.name === SESSION_COOKIE)!
  return { app, cookie: `${SESSION_COOKIE}=${c.value}` }
}

beforeEach(() => verifyCredentials.mockReset())

describe('account routes', () => {
  it('requires authentication', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({ method: 'GET', url: '/api/accounts' })
    expect(res.statusCode).toBe(401)
  })

  it('links, lists, sets default and removes an account', async () => {
    const { app, cookie } = await authedApp()
    verifyCredentials.mockResolvedValue(true)

    const link = await app.inject({
      method: 'POST', url: '/api/accounts', headers: { cookie },
      payload: { label: 'Me', username: 'me@x.de', password: 'good' },
    })
    expect(link.statusCode).toBe(201)
    const id = link.json().id as string
    expect(JSON.stringify(link.json())).not.toContain('good')

    const list = await app.inject({ method: 'GET', url: '/api/accounts', headers: { cookie } })
    expect(list.statusCode).toBe(200)
    expect(list.json()).toHaveLength(1)

    const def = await app.inject({ method: 'PATCH', url: `/api/accounts/${id}/default`, headers: { cookie } })
    expect(def.statusCode).toBe(204)

    const del = await app.inject({ method: 'DELETE', url: `/api/accounts/${id}`, headers: { cookie } })
    expect(del.statusCode).toBe(204)
  })

  it('returns 400 when Yazio rejects the credentials', async () => {
    const { app, cookie } = await authedApp()
    verifyCredentials.mockResolvedValue(false)
    const res = await app.inject({
      method: 'POST', url: '/api/accounts', headers: { cookie },
      payload: { label: 'Bad', username: 'x', password: 'y' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('404 on default/delete of an unknown account', async () => {
    const { app, cookie } = await authedApp()
    const r1 = await app.inject({ method: 'PATCH', url: '/api/accounts/nope/default', headers: { cookie } })
    expect(r1.statusCode).toBe(404)
    const r2 = await app.inject({ method: 'DELETE', url: '/api/accounts/nope', headers: { cookie } })
    expect(r2.statusCode).toBe(404)
  })
})
