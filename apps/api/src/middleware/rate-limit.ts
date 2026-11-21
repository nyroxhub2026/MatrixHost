import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";

export async function registerRateLimit(
  app: FastifyInstance
): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    ban: 0,

    keyGenerator: (request) => {
      return request.ip;
    },

    errorResponseBuilder: () => ({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message:
          "Too many requests. Please try again later.",
      },
    }),
  });
}
