import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, ApiError } from './client'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })

function ok(body: unknown, status = 200) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) }
}

describe('api client', () => {
  it('GET /auth/me returns the user and sends credentials', async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: 'u1', username: 'jens' }))
    const user = await api.auth.me()
    expect(user).toEqual({ id: 'u1', username: 'jens' })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ credentials: 'include' }))
  })

  it('POST sends JSON body + content-type', async () => {
    fetchMock.mockResolvedValueOnce(ok({ accountId: 'a1', lines: [] }))
    await api.match('80g Haferflocken')
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ text: '80g Haferflocken', accountId: undefined })
    expect(init.headers['content-type']).toBe('application/json')
  })

  it('throws ApiError with status + error code on failure', async () => {
    fetchMock.mockResolvedValueOnce(ok({ error: 'no_account' }, 409))
    fetchMock.mockResolvedValueOnce(ok({ error: 'no_account' }, 409))
    await expect(api.match('x')).rejects.toMatchObject({ status: 409, message: 'no_account' })
    await expect(api.match('x')).rejects.toBeInstanceOf(ApiError)
  })

  it('returns undefined for 204', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.reject(new Error('no body')) })
    await expect(api.auth.logout()).resolves.toBeUndefined()
  })
})
