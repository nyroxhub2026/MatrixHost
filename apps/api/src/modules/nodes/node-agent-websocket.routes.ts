import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppError } from "@matrixhost/shared";

import { authenticateNodeAgent } from "./node-agent-auth.service.js";

const paramsSchema = z
  .object({
    nodeId: z.uuid(),
  })
  .strict();

export async function nodeAgentWebSocketRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/:nodeId/agent/ws",
    {
      websocket: true,

      // Authentication happens before the WebSocket upgrade.
      preValidation: async (request) => {
        const params = paramsSchema.safeParse(
          request.params,
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
            "Agent credentials are required.",
          );
        }

        const credential = authorization.slice(7);

        await authenticateNodeAgent(
          params.data.nodeId,
          credential,
        );
      },
    },
    (socket, request) => {
      const params = paramsSchema.parse(
        request.params,
      );

      request.log.info(
        {
          nodeId: params.nodeId,
        },
        "Node Agent WebSocket connected.",
      );

      socket.send(
        JSON.stringify({
          type: "connected",
          nodeId: params.nodeId,
          serverTime: new Date().toISOString(),
          protocolVersion: 1,
        }),
      );

      socket.on("error", (error) => {
        request.log.warn(
          {
            nodeId: params.nodeId,
            errorName: error.name,
          },
          "Node Agent WebSocket error.",
        );
      });

      socket.on("close", () => {
        request.log.info(
          {
            nodeId: params.nodeId,
          },
          "Node Agent WebSocket disconnected.",
        );
      });
    },
  );
}
