import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";

export async function registerRequestContext(
  app: FastifyInstance
): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    const requestId = randomUUID();

    request.id = requestId;
    reply.header("x-request-id", requestId);
  });
}
