import "dotenv/config";

import Fastify from "fastify";
import { loadAppConfig } from "./config/index.js";
import {
  registerCors,
  registerErrorHandler,
  registerRateLimit,
  registerRequestContext,
  registerSecurityHeaders
} from "./middleware/index.js";
import {
  authRoutes,
  healthRoutes,
  systemRoutes,
  userRoutes
} from "./modules/index.js";

async function bootstrap(): Promise<void> {
  const config = loadAppConfig();

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.password",
        "req.body.currentPassword",
        "req.body.newPassword",
        "req.body.refreshToken",
        "req.body.token"
      ]
    },
    trustProxy: false,
    requestIdHeader: false
  });

  registerErrorHandler(app);

  await registerRequestContext(app);
  await registerSecurityHeaders(app);
  await registerRateLimit(app);
  await registerCors(app, config);

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(systemRoutes);
      await api.register(authRoutes);
      await api.register(userRoutes);
    },
    { prefix: "/api/v1" }
  );

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "The requested API endpoint was not found."
      }
    });
  });

  app.addHook("onClose", async () => {
    const { prisma } = await import("@matrixhost/database");
    await prisma.$disconnect();
  });

  await app.listen({
    host: config.API_HOST,
    port: config.API_PORT
  });

  app.log.info(
    `MatrixHost API listening on ${config.API_HOST}:${config.API_PORT}`
  );

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}. Shutting down API...`);

    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ error }, "API shutdown failed");
      process.exit(1);
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((error: unknown) => {
  console.error("Failed to start MatrixHost API:", error);
  process.exitCode = 1;
});
