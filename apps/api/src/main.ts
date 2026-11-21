import Fastify from "fastify";
import websocket from "@fastify/websocket";

import {
  healthRoutes,
  systemRoutes,
  authRoutes,
  userRoutes,
  serverRoutes,
  nodeRoutes,
} from "./modules/index.js";

import {
  registerRequestContext,
  registerSecurityHeaders,
  registerRateLimit,
  registerCors,
  registerErrorHandler,
  authenticate,
} from "./middleware/index.js";

import { appConfig } from "./config/index.js";

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

  // Security and HTTP configuration.
  await registerSecurityHeaders(app);
  await registerCors(app, appConfig);
  await registerRateLimit(app);

  // WebSocket support.
  await app.register(websocket);

  // Request context and error handling.
  await registerRequestContext(app);
  registerErrorHandler(app);

  // Authentication.
  app.decorateRequest("authUser", null);
  app.decorate("authenticate", authenticate);

  // API routes.
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

  await app.register(nodeRoutes, {
    prefix: "/nodes",
  });

  return app;
}

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({
      host: appConfig.API_HOST,
      port: appConfig.API_PORT,
    });

    app.log.info(
      `MatrixHost API listening on ${appConfig.API_HOST}:${appConfig.API_PORT}`
    );
  } catch (error) {
    app.log.error(error);
    await app.close();
    process.exitCode = 1;
  }
}

if (appConfig.NODE_ENV !== "test") {
  void start();
}
