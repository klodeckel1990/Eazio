import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'
import type { OAuthClaims, OAuthProvider, OAuthVerifier } from '../../modules/auth/oauth.js'

// Verifier-Fake: mappt idToken-Strings auf Claims, wirft sonst wie jose.
function fakeVerifier(tokens: Record<string, Partial<OAuthClaims>>): OAuthVerifier {
  return async (_provider: OAuthProvider, idToken: string) => {
    const claims = tokens[idToken]
    if (!claims) throw new Error('signature verification failed')
    return {
      subject: claims.subject ?? 'sub-1',
      email: claims.email ?? null,
      emailVerified: claims.emailVerified ?? false,
      name: claims.name ?? null,
    }
  }
}

function oauthLogin(app: ReturnType<typeof buildApp>, provider: string, payload: object) {
  return app.inject({ method: 'POST', url: `/api/auth/oauth/${provider}`, payload })
}

describe('oauth login', () => {
  it('creates a new account from a verified google token', async () => {
    const app = buildApp(createTestDb(), {
      verifyOAuth: fakeVerifier({
        'token-0001': { subject: 'g-1', email: 'jens@example.com', emailVerified: true, name: 'Jens Gößen' },
      }),
    })
    const res = await oauthLogin(app, 'google', { idToken: 'token-0001', platform: 'ios' })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ id: string; username: string; token: string }>()
    expect(body.username).toBe('jens.go.en') // Diakritika gefaltet, ß → Punkt
    expect(body.token).toMatch(/^eaz_/)

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${body.token}` },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ id: body.id })
  })

  it('returns the same user on repeated logins with the same identity', async () => {
    const app = buildApp(createTestDb(), {
      verifyOAuth: fakeVerifier({
        'token-0001': { subject: 'g-1', email: 'a@example.com', emailVerified: true, name: 'Anna' },
      }),
    })
    const first = await oauthLogin(app, 'google', { idToken: 'token-0001' })
    const second = await oauthLogin(app, 'google', { idToken: 'token-0001' })
    expect(second.statusCode).toBe(200)
    expect(second.json<{ id: string }>().id).toBe(first.json<{ id: string }>().id)
  })

  it('links a verified email to an existing password account', async () => {
    const app = buildApp(createTestDb(), {
      verifyOAuth: fakeVerifier({
        'token-0001': { subject: 'a-1', email: 'jens@example.com', emailVerified: true },
      }),
    })
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'jens', email: 'jens@example.com', password: 'pw-123456' },
    })
    expect(reg.statusCode).toBe(201)
    const res = await oauthLogin(app, 'apple', { idToken: 'token-0001' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: reg.json<{ id: string }>().id, username: 'jens' })
  })

  it('does NOT link an unverified email — creates a separate account', async () => {
    const app = buildApp(createTestDb(), {
      verifyOAuth: fakeVerifier({
        'token-0001': { subject: 'g-9', email: 'jens@example.com', emailVerified: false, name: 'Mallory' },
      }),
    })
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'jens', email: 'jens@example.com', password: 'pw-123456' },
    })
    const res = await oauthLogin(app, 'google', { idToken: 'token-0001' })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ id: string }>().id).not.toBe(reg.json<{ id: string }>().id)
  })

  it('deduplicates the generated username', async () => {
    const app = buildApp(createTestDb(), {
      verifyOAuth: fakeVerifier({
        'token-0001': { subject: 'g-1', name: 'Jens', email: 'x@example.com', emailVerified: true },
        'token-0002': { subject: 'g-2', name: 'Jens', email: 'y@example.com', emailVerified: true },
      }),
    })
    const first = await oauthLogin(app, 'google', { idToken: 'token-0001' })
    const second = await oauthLogin(app, 'google', { idToken: 'token-0002' })
    expect(first.json<{ username: string }>().username).toBe('jens')
    expect(second.json<{ username: string }>().username).toBe('jens-2')
  })

  it('rejects password login for social-only accounts', async () => {
    const app = buildApp(createTestDb(), {
      verifyOAuth: fakeVerifier({
        'token-0001': { subject: 'g-1', name: 'Solo', email: 's@example.com', emailVerified: true },
      }),
    })
    const created = await oauthLogin(app, 'google', { idToken: 'token-0001' })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: created.json<{ username: string }>().username, password: 'whatever-123' },
    })
    expect(login.statusCode).toBe(401)
  })

  it('rejects an invalid token with 401', async () => {
    const app = buildApp(createTestDb(), { verifyOAuth: fakeVerifier({}) })
    const res = await oauthLogin(app, 'google', { idToken: 'forged-token' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ error: 'invalid_token' })
  })

  it('returns 503 for google when no client ids are configured (real verifier)', async () => {
    const app = buildApp(createTestDb()) // echter Verifier; Test-Env hat keine Google-IDs
    const res = await oauthLogin(app, 'google', { idToken: 'irrelevant-token' })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toMatchObject({ error: 'provider_not_configured' })
  })

  it('exposes the public provider config', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({ method: 'GET', url: '/api/auth/oauth/config' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ google: null, apple: { webClientId: null } })
  })
})
