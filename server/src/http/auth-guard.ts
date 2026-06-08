import type { FastifyReply, FastifyRequest } from 'fastify'

/** preHandler for protected routes — used by M2+ feature routes. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user) {
    await reply.status(401).send({ error: 'unauthenticated' })
    return
  }
}
