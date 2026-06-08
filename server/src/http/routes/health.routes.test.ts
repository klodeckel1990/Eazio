import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import { registerHealthRoutes } from './health.routes.js'

describe('health route', () => {
  it('returns ok status', async () => {
    const app = Fastify()
    registerHealthRoutes(app)
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })
})
