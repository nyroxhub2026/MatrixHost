import Fastify from "fastify";
import websocket from "@fastify/websocket";

import { appConfig } from "./config/index.js";

import {
  registerCors,
  registerErrorHandler,
  registerRateLimit,
  registerSecurityHeaders,
  registerRequestContext,
  authenticate,
} from "./middleware/index.js";

import {
  healthRoutes,
  systemRoutes,
  authRoutes,
  userRoutes,
  serverRoutes,
  nodeRoutes,
  nodeAgentCredentialRoutes,
  nodeAgentHeartbeatRoutes,
  nodeAgentWebSocketRoutes,
} from "./modules/index.js";

import { prisma } from "@matrixhost/database";

async function buildApp() {
  const app = Fastify({
    logger: {
      level: appConfig.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "password",
          "passwordHash",
          "token",
          "credential",
          "credentialHash",
        ],
        censor: "[REDACTED]",
      },
    },

    trustProxy: false,

    bodyLimit: 1024 * 1024,

    requestTimeout: 30_000,

    connectionTimeout: 10_000,

    keepAliveTimeout: 72_000,
  });

  // Security and request infrastructure
  await registerSecurityHeaders(app);
  await registerCors(app);
  await registerRateLimit(app);
  registerRequestContext(app);
  registerErrorHandler(app);

  // WebSocket support
  await app.register(websocket, {
    options: {
      maxPayload: 64 * 1024,
      perMessageDeflate: false,
    },
  });

  // Authentication decorator
  app.decorate("authenticate", authenticate);

  // Health and system routes
  await app.register(healthRoutes);
  await app.register(systemRoutes);

  // Authentication routes
  await app.register(authRoutes, {
    prefix: "/auth",
  });

  // User routes
  await app.register(userRoutes, {
    prefix: "/users",
  });

  // Server routes
  await app.register(serverRoutes, {
    prefix: "/servers",
  });

  // Node management routes
  await app.register(nodeRoutes, {
    prefix: "/nodes",
  });

  // Node Agent credential management
  await app.register(nodeAgentCredentialRoutes, {
    prefix: "/nodes",
  });

  // Node Agent heartbeat endpoint
  await app.register(nodeAgentHeartbeatRoutes, {
    prefix: "/nodes",
  });

  // Node Agent WebSocket connection
  await app.register(nodeAgentWebSocketRoutes, {
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
      {
        host: appConfig.API_HOST,
        port: appConfig.API_PORT,
        environment: appConfig.NODE_ENV,
      },
      "MatrixHost API started.",
    );
  } catch (error) {
    app.log.error(error, "Failed to start MatrixHost API.");

    await app.close();
    await prisma.$disconnect();

    process.exitCode = 1;
  }

  const shutdown = async (signal: string) => {
    app.log.info(
      { signal },
      "MatrixHost API is shutting down.",
    );

    try {
      await app.close();
      await prisma.$disconnect();

      app.log.info("MatrixHost API stopped.");
      process.exitCode = 0;
    } catch (error) {
      app.log.error(
        error,
        "Error during API shutdown.",
      );

      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void start();
