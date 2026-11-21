import type { FastifyInstance } from "fastify";

const REQUEST_ID_HEADER = "x-request-id";

export async function registerRequestContext(
  app: FastifyInstance
): Promise<void> {
  app.addHook(
    "onRequest",
    async (request, reply) => {
      reply.header(
        REQUEST_ID_HEADER,
        request.id
      );
    }
  );
}
