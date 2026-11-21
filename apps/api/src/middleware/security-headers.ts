import helmet from "@fastify/helmet";
import type { FastifyInstance } from "fastify";

export async function registerSecurityHeaders(
  app: FastifyInstance
): Promise<void> {
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  });
}
