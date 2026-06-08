import type { FastifyInstance } from 'fastify'
import type { FastifyError } from '@fastify/error'
import { ZodError, z } from 'zod'

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError | ZodError>((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: 'validation_error', details: z.flattenError(error) })
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({ error: error.message })
    }
    app.log.error(error)
    return reply.status(500).send({ error: 'internal_error' })
  })
}
