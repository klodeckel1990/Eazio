import { describe, it, expect } from 'vitest'
import { env } from './env.js'

describe('env config', () => {
  it('parses test environment with sane values', () => {
    expect(env.NODE_ENV).toBe('test')
    expect(env.DATABASE_PATH).toBe(':memory:')
    expect(Buffer.from(env.MASTER_KEY, 'base64').length).toBe(32)
    expect(env.YAZIO_COUNTRIES).toBe('DE')
  })
})
