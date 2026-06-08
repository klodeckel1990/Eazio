import { describe, it, expect } from 'vitest'
import { createTestDb } from './db/test-db.js'
import { buildApp } from './app.js'

describe('app factory', () => {
  it('wires the health route', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })

  it('treats unauthenticated requests as anonymous (no user)', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(res.statusCode).toBe(401)
  })
})
