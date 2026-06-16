import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountsPage } from './AccountsPage'

const list = vi.fn()
const link = vi.fn()
const setDefault = vi.fn()
const remove = vi.fn()
const settingsGet = vi.fn()
const settingsUpdate = vi.fn()
const goalsGet = vi.fn()
const goalsUpdate = vi.fn()

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    deleteAccount: vi.fn(),
    refreshEntitlement: vi.fn(),
    premium: false,
    user: { id: 'u1', username: 'tester' },
  }),
}))

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
    }
  },
  api: {
    accounts: {
      list: () => list(),
      link: (...a: unknown[]) => link(...a),
      setDefault: (...a: unknown[]) => setDefault(...a),
      remove: (...a: unknown[]) => remove(...a),
    },
    settings: {
      get: () => settingsGet(),
      update: (...a: unknown[]) => settingsUpdate(...a),
    },
    goals: {
      get: () => goalsGet(),
      update: (...a: unknown[]) => goalsUpdate(...a),
    },
  },
}))

const TEST_GOALS = {
  kcalTarget: 2000,
  proteinG: null,
  fatG: null,
  carbsG: null,
  waterMl: 2000,
  weightKg: null,
  weightGoalKg: null,
}

beforeEach(() => {
  list.mockReset()
  link.mockReset()
  setDefault.mockReset()
  remove.mockReset()
  settingsGet.mockReset()
  settingsUpdate.mockReset()
  list.mockResolvedValue([])
  link.mockResolvedValue({ id: 'a1', label: 'Me', yazioUsername: 'me@x.de', isDefault: true })
  setDefault.mockResolvedValue(undefined)
  remove.mockResolvedValue(undefined)
  settingsGet.mockResolvedValue({ shoppingListFormat: 'plain', mirrorToYazio: true })
  settingsUpdate.mockResolvedValue({ shoppingListFormat: 'plain', mirrorToYazio: true })
  goalsGet.mockReset()
  goalsUpdate.mockReset()
  goalsGet.mockResolvedValue(TEST_GOALS)
  goalsUpdate.mockResolvedValue(TEST_GOALS)
})

describe('AccountsPage', () => {
  it('renders an empty account list on mount', async () => {
    render(<AccountsPage />)
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
  })

  it('renders linked accounts from api.accounts.list', async () => {
    list.mockResolvedValue([
      { id: 'a1', label: 'Mein Konto', yazioUsername: 'jens@x.de', isDefault: true },
    ])
    render(<AccountsPage />)
    await userEvent.click(await screen.findByRole('button', { name: /Yazio/i }))
    await waitFor(() => expect(screen.getByText(/Mein Konto/)).toBeInTheDocument())
    expect(screen.getByText(/jens@x\.de/)).toBeInTheDocument()
  })

  it('shows Standard badge for default account', async () => {
    list.mockResolvedValue([
      { id: 'a1', label: 'Haupt', yazioUsername: 'a@b.de', isDefault: true },
    ])
    render(<AccountsPage />)
    await userEvent.click(await screen.findByRole('button', { name: /Yazio/i }))
    await waitFor(() => expect(screen.getByText(/Standard/i)).toBeInTheDocument())
  })

  it('links a new account when the form is submitted', async () => {
    render(<AccountsPage />)
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    await userEvent.click(await screen.findByRole('button', { name: /Yazio/i }))

    await userEvent.type(screen.getByLabelText(/Bezeichnung/i), 'Me')
    await userEvent.type(screen.getByLabelText(/Benutzername/i), 'me@x.de')
    await userEvent.type(screen.getByLabelText(/Passwort/i), 'secret')
    await userEvent.click(screen.getByRole('button', { name: /Verknüpfen/i }))

    await waitFor(() => expect(link).toHaveBeenCalledWith('Me', 'me@x.de', 'secret'))
    // list is called again after successful link
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  })

  it('shows error message on ApiError 400 during link', async () => {
    const { ApiError } = await import('../api/client')
    link.mockRejectedValue(new ApiError(400, 'invalid_credentials'))
    render(<AccountsPage />)
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    await userEvent.click(await screen.findByRole('button', { name: /Yazio/i }))

    await userEvent.type(screen.getByLabelText(/Bezeichnung/i), 'Me')
    await userEvent.type(screen.getByLabelText(/Benutzername/i), 'me@x.de')
    await userEvent.type(screen.getByLabelText(/Passwort/i), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /Verknüpfen/i }))

    await waitFor(() => expect(screen.getByText(/Yazio-Login fehlgeschlagen/i)).toBeInTheDocument())
  })
})
