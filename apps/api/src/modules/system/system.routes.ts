import type { FastifyInstance } from "fastify";

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/system/info", async () => ({
    name: "MatrixHost API",
    version: "1.0.0",
    description: "Game server management platform API",
    environment: process.env.NODE_ENV ?? "development",
    timestamp: new Date().toISOString()
  }));
}
