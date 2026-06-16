import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
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

  it('serves the static landing page at / from the default public dir', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
    expect(res.body).toContain('Tellerwert')
    expect(res.body).toContain('App Store')
    // the React PWA shell must no longer be served
    expect(res.body).not.toContain('id="root"')
  })

  it('serves the SPA with an /api JSON 404 fallback when a web dir exists', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'eazio-web-'))
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html><div id="root">SPA</div>')
    try {
      const app = buildApp(createTestDb(), { webDir: dir })

      const spa = await app.inject({ method: 'GET', url: '/some/client/route' })
      expect(spa.statusCode).toBe(200)
      expect(spa.headers['content-type']).toMatch(/text\/html/)
      expect(spa.body).toContain('id="root"')

      const apiMiss = await app.inject({ method: 'GET', url: '/api/does-not-exist' })
      expect(apiMiss.statusCode).toBe(404)
      expect(apiMiss.json()).toEqual({ error: 'not_found' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
