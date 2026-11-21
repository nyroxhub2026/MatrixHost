import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppError } from "@matrixhost/shared";

import { requirePermission } from "../../middleware/authorization.js";

import {
  createNodeAgentCredential,
  revokeNodeAgentCredential,
} from "./node-agent-credential.service.js";

const paramsSchema = z
  .object({
    nodeId: z.uuid(),
  })
  .strict();

export async function nodeAgentCredentialRoutes(
  app: FastifyInstance
): Promise<void> {
  const adminAccess = {
    preHandler: [
      app.authenticate,
      requirePermission("nodes.manage"),
    ],
  };

  app.post(
    "/:nodeId/credential",
    adminAccess,
    async (request, reply) => {
      const parsed = paramsSchema.safeParse(request.params);

      if (!parsed.success) {
        throw AppError.badRequest("Invalid node ID.");
      }

      const result = await createNodeAgentCredential(
        parsed.data.nodeId
      );

      return reply.code(201).send({
        success: true,
        data: result,
      });
    }
  );

  app.delete(
    "/:nodeId/credential",
    adminAccess,
    async (request) => {
      const parsed = paramsSchema.safeParse(request.params);

      if (!parsed.success) {
        throw AppError.badRequest("Invalid node ID.");
      }

      await revokeNodeAgentCredential(
        parsed.data.nodeId
      );

      return {
        success: true,
        message: "Node Agent credential revoked.",
      };
    }
  );
}
