import type { FastifyInstance } from "fastify";

import { AppError } from "@matrixhost/shared";

import {
  createNodeSchema,
  updateNodeSchema,
  nodeParamsSchema,
} from "./node.schemas.js";

import {
  createNode,
  getNodeById,
  listNodes,
  updateNode,
} from "./node.service.js";

import { requirePermission } from "../../middleware/authorization.js";

export async function nodeRoutes(
  app: FastifyInstance
): Promise<void> {
  const adminAccess = {
    preHandler: [
      app.authenticate,
      requirePermission("nodes.manage"),
    ],
  };

  app.post(
    "/",
    adminAccess,
    async (request, reply) => {
      const parsed = createNodeSchema.safeParse(
        request.body
      );

      if (!parsed.success) {
        throw AppError.badRequest(
          "Invalid node creation data.",
          parsed.error.flatten()
        );
      }

      const node = await createNode(parsed.data);

      return reply.code(201).send({
        success: true,
        data: { node },
      });
    }
  );

  app.get(
    "/",
    {
      preHandler: [
        app.authenticate,
        requirePermission("nodes.read"),
      ],
    },
    async () => {
      const nodes = await listNodes();

      return {
        success: true,
        data: { nodes },
      };
    }
  );

  app.get(
    "/:nodeId",
    {
      preHandler: [
        app.authenticate,
        requirePermission("nodes.read"),
      ],
    },
    async (request) => {
      const parsed = nodeParamsSchema.safeParse(
        request.params
      );

      if (!parsed.success) {
        throw AppError.badRequest(
          "Invalid node ID.",
          parsed.error.flatten()
        );
      }

      const node = await getNodeById(
        parsed.data.nodeId
      );

      return {
        success: true,
        data: { node },
      };
    }
  );

  app.patch(
    "/:nodeId",
    adminAccess,
    async (request) => {
      const params = nodeParamsSchema.safeParse(
        request.params
      );

      if (!params.success) {
        throw AppError.badRequest(
          "Invalid node ID.",
          params.error.flatten()
        );
      }

      const body = updateNodeSchema.safeParse(
        request.body
      );

      if (!body.success) {
        throw AppError.badRequest(
          "Invalid node update data.",
          body.error.flatten()
        );
      }

      const node = await updateNode(
        params.data.nodeId,
        body.data
      );

      return {
        success: true,
        data: { node },
      };
    }
  );
}
