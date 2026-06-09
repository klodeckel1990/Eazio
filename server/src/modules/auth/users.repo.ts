import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { hashPassword } from './password.js'

export interface PublicUser {
  id: string
  username: string
}

export async function createUser(
  db: DB,
  username: string,
  password: string,
  email: string | null = null,
): Promise<PublicUser> {
  const id = randomUUID()
  const passwordHash = await hashPassword(password)
  db.insert(users).values({ id, username, email, passwordHash, createdAt: Date.now() }).run()
  return { id, username }
}

export function findUserByUsername(db: DB, username: string) {
  return db.select().from(users).where(eq(users.username, username)).get()
}

export function findUserByEmail(db: DB, email: string) {
  return db.select().from(users).where(eq(users.email, email)).get()
}

// Projects only public columns so callers (e.g. the /me route) can never
// accidentally serialize the password hash.
export function findUserById(db: DB, id: string): PublicUser | undefined {
  return db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, id))
    .get()
}
