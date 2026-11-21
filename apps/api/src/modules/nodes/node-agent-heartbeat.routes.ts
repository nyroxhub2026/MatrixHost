import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppError } from "@matrixhost/shared";

import { agentHeartbeatSchema } from "./node-agent.schemas.js";
import { authenticateNodeAgent } from "./node-agent-auth.service.js";
import { updateNodeHeartbeat } from "./node-agent-heartbeat.service.js";

const heartbeatAuthSchema = z
  .object({
    nodeId: z.uuid(),
  })
  .strict();

export async function nodeAgentHeartbeatRoutes(
  app: FastifyInstance
): Promise<void> {
  app.post(
    "/:nodeId/heartbeat",
    async (request, reply) => {
      const params = heartbeatAuthSchema.safeParse(
        request.params
      );

      if (!params.success) {
        throw AppError.badRequest("Invalid node ID.");
      }

      const authorization =
        request.headers.authorization;

      if (
        typeof authorization !== "string" ||
        !authorization.startsWith("Bearer ")
      ) {
        throw AppError.unauthorized(
          "Agent credentials are required."
        );
      }

      const credential = authorization.slice(7);

      const agent = await authenticateNodeAgent(
        params.data.nodeId,
        credential
      );

      const parsed = agentHeartbeatSchema.safeParse(
        request.body
      );

      if (!parsed.success) {
        throw AppError.badRequest(
          "Invalid heartbeat data.",
          parsed.error.flatten()
        );
      }

      const node = await updateNodeHeartbeat(
        agent.nodeId,
        parsed.data
      );

      return reply.send({
        success: true,
        data: {
          node,
          message: "Heartbeat received.",
        },
      });
    }
  );
}
