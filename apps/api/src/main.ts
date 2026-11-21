import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";

import {
  healthRoutes,
  systemRoutes,
  authRoutes,
  userRoutes,
  serverRoutes,
} from "./modules/index.js";

import {
  requestContext,
  securityHeaders,
  errorHandler,
} from "./middleware/index.js";

import { appConfig } from "./config/index.js";
import {
  authenticate,
} from "./middleware/authentication.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: appConfig.LOG_LEVEL,
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.password",
        "req.body.refreshToken",
      ],
    },
    trustProxy: false,
    bodyLimit: 1024 * 1024,
    requestIdHeader: "x-request-id",
  });

  await app.register(helmet);

  await app.register(cors, {
    origin: appConfig.PANEL_URL,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await app.register(websocket);

  app.addHook("onRequest", requestContext);
  app.addHook("onRequest", securityHeaders);

  app.setErrorHandler(errorHandler);

  // Register authentication directly on the root instance.
  app.decorateRequest("authUser", null);
  app.decorate("authenticate", authenticate);

  await app.register(healthRoutes, {
    prefix: "/health",
  });

  await app.register(systemRoutes, {
    prefix: "/system",
  });

  await app.register(authRoutes, {
    prefix: "/auth",
  });

  await app.register(userRoutes, {
    prefix: "/users",
  });

  await app.register(serverRoutes, {
    prefix: "/servers",
  });

  return app;
}

async function start() {
  const app = await buildApp();

  try {
    await app.listen({
      host: appConfig.API_HOST,
      port: appConfig.API_PORT,
    });
  } catch (error) {
    app.log.error(error);
    await app.close();
    process.exitCode = 1;
  }
}

if (appConfig.NODE_ENV !== "test") {
  void start();
}
