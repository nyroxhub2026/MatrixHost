import type { FastifyInstance } from "fastify";

import { appConfig } from "../../config/index.js";

export async function systemRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get("/info", async () => ({
    name: "MatrixHost API",
    version: "1.0.0",
    description: "Game server management platform API",
    environment: appConfig.NODE_ENV,
    timestamp: new Date().toISOString(),
  }));
}
