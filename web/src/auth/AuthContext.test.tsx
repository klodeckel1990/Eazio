import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from './AuthContext'

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
    }
  },
  setToken: vi.fn(),
  getToken: vi.fn(() => null),
  api: {
    auth: {
      me: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    },
  },
}))

import { api } from '../api/client'

function Probe() {
  const { user, loading, login, logout } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.username : 'anonymous'}</span>
      <button onClick={() => login('jens', 'secret')}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AuthProvider', () => {
  it('starts with loading=true then resolves anonymous when me() rejects', async () => {
    vi.mocked(api.auth.me).mockRejectedValue(new Error('401'))

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    // initially loading
    expect(screen.getByTestId('loading').textContent).toBe('true')

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false')
    })
    expect(screen.getByTestId('user').textContent).toBe('anonymous')
  })

  it('resolves with the user when me() succeeds', async () => {
    vi.mocked(api.auth.me).mockResolvedValue({ id: '1', username: 'jens' })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('jens')
    })
  })

  it('login() sets user to the returned value', async () => {
    vi.mocked(api.auth.me).mockRejectedValue(new Error('401'))
    vi.mocked(api.auth.login).mockResolvedValue({ id: '1', username: 'jens', token: 'eaz_test-token' })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false')
    })
    expect(screen.getByTestId('user').textContent).toBe('anonymous')

    await act(async () => {
      await userEvent.click(screen.getByText('login'))
    })

    expect(screen.getByTestId('user').textContent).toBe('jens')
    expect(api.auth.login).toHaveBeenCalledWith('jens', 'secret')
  })

  it('logout() clears user', async () => {
    vi.mocked(api.auth.me).mockResolvedValue({ id: '1', username: 'jens' })
    vi.mocked(api.auth.logout).mockResolvedValue(undefined)

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('jens')
    })

    await act(async () => {
      await userEvent.click(screen.getByText('logout'))
    })

    expect(screen.getByTestId('user').textContent).toBe('anonymous')
  })

  it('useAuth throws when used outside AuthProvider', () => {
    // suppress console.error from React error boundary
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow('useAuth must be used within AuthProvider')
    spy.mockRestore()
  })
})
