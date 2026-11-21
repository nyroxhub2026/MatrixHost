import type { FastifyInstance } from "fastify";
import { getHealthStatus } from "../../services/health-service.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    const health = await getHealthStatus();

    const statusCode = health.status === "ok" ? 200 : 503;

    return reply.status(statusCode).send(health);
  });

  app.get("/health/live", async () => ({
    status: "ok",
    timestamp: new Date().toISOString()
  }));

  app.get("/health/ready", async (_request, reply) => {
    const health = await getHealthStatus();

    if (health.status !== "ok") {
      return reply.status(503).send({
        status: "not_ready",
        timestamp: health.timestamp
      });
    }

    return {
      status: "ready",
      timestamp: health.timestamp
    };
  });
}
