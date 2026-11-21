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

    keyGenerator: (request) => request.ip,

    errorResponseBuilder: () => ({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message:
          "Too many requests. Please try again later.",
      },
    }),
  });

  // Strict limits for authentication endpoints.
  app.register(async (authApp) => {
    await authApp.register(rateLimit, {
      global: true,
      max: 10,
      timeWindow: "1 minute",
      ban: 0,

      keyGenerator: (request) => request.ip,

      errorResponseBuilder: () => ({
        success: false,
        error: {
          code: "AUTH_RATE_LIMIT_EXCEEDED",
          message:
            "Too many authentication attempts. Please try again later.",
        },
      }),
    });

    authApp.addHook("onRoute", (routeOptions) => {
      if (
        routeOptions.url === "/login" ||
        routeOptions.url === "/register" ||
        routeOptions.url === "/refresh"
      ) {
        routeOptions.config = {
          ...routeOptions.config,
          rateLimit: {
            max: 10,
            timeWindow: "1 minute",
          },
        };
      }
    });
  });
}
