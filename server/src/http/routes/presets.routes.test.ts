import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE } from '../../modules/auth/sessions.js'

const BOOTSTRAP = 'test-bootstrap-token'
async function authed() {
  const app = buildApp(createTestDb())
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { token: BOOTSTRAP, username: 'jens', password: 'pw-123456' } })
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'jens', password: 'pw-123456' } })
  return { app, cookie: `${SESSION_COOKIE}=${login.cookies.find((c) => c.name === SESSION_COOKIE)!.value}` }
}
const body = { name: 'Mein Müsli', items: [{ rawText: '80g Haferflocken', productId: 'p1', amountG: 80 }] }

describe('presets routes', () => {
  it('401 without auth', async () => {
    const app = buildApp(createTestDb())
    expect((await app.inject({ method: 'GET', url: '/api/presets' })).statusCode).toBe(401)
  })

  it('creates, lists, loads and deletes a preset', async () => {
    const { app, cookie } = await authed()
    const create = await app.inject({ method: 'POST', url: '/api/presets', headers: { cookie }, payload: body })
    expect(create.statusCode).toBe(201)
    const id = create.json().id as string

    const list = await app.inject({ method: 'GET', url: '/api/presets', headers: { cookie } })
    expect(list.json()).toHaveLength(1)

    const load = await app.inject({ method: 'GET', url: `/api/presets/${id}`, headers: { cookie } })
    expect(load.json().items[0].productId).toBe('p1')

    expect((await app.inject({ method: 'DELETE', url: `/api/presets/${id}`, headers: { cookie } })).statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: `/api/presets/${id}`, headers: { cookie } })).statusCode).toBe(404)
  })

  it('409 on a duplicate preset name', async () => {
    const { app, cookie } = await authed()
    await app.inject({ method: 'POST', url: '/api/presets', headers: { cookie }, payload: body })
    const dup = await app.inject({ method: 'POST', url: '/api/presets', headers: { cookie }, payload: body })
    expect(dup.statusCode).toBe(409)
  })
})
