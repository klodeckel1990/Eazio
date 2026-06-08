import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { hashPassword } from './password.js'

export interface PublicUser {
  id: string
  username: string
}

export async function createUser(db: DB, username: string, password: string): Promise<PublicUser> {
  const id = randomUUID()
  const passwordHash = await hashPassword(password)
  db.insert(users).values({ id, username, passwordHash, createdAt: Date.now() }).run()
  return { id, username }
}

export function findUserByUsername(db: DB, username: string) {
  return db.select().from(users).where(eq(users.username, username)).get()
}

export function findUserById(db: DB, id: string) {
  return db.select().from(users).where(eq(users.id, id)).get()
}
