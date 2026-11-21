import type { FastifyInstance } from "fastify";

import {
  getHealthStatus,
  getLivenessStatus,
} from "../../services/health-service.js";

export async function healthRoutes(
  app: FastifyInstance
): Promise<void> {
  // General health status.
  app.get("/", async (_request, reply) => {
    const health = await getHealthStatus();

    const statusCode =
      health.status === "ok" ? 200 : 503;

    return reply.status(statusCode).send(health);
  });

  // API process liveness.
  app.get("/live", async () => {
    return getLivenessStatus();
  });

  // API and database readiness.
  app.get("/ready", async (_request, reply) => {
    const health = await getHealthStatus();

    if (health.status !== "ok") {
      return reply.status(503).send({
        status: "not_ready",
        timestamp: health.timestamp,
      });
    }

    return reply.send({
      status: "ready",
      timestamp: health.timestamp,
    });
  });
}
