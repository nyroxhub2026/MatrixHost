import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppError } from "@matrixhost/shared";

import { createServerSchema } from "./server.schemas.js";

import {
  createServer,
  getServerById,
  listServers,
} from "./server.service.js";

const serverParamsSchema = z
  .object({
    serverId: z.uuid(),
  })
  .strict();

export async function serverRoutes(
  app: FastifyInstance
): Promise<void> {
  app.post(
    "/",
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const user = request.authUser;

      if (!user) {
        throw AppError.unauthorized();
      }

      const parsed = createServerSchema.safeParse(
        request.body
      );

      if (!parsed.success) {
        throw AppError.badRequest(
          "Invalid server creation data.",
          parsed.error.flatten()
        );
      }

      const server = await createServer(
        user.id,
        parsed.data
      );

      return reply.code(202).send({
        success: true,
        message: "Server creation job has been queued.",
        data: {
          server,
        },
      });
    }
  );

  app.get(
    "/",
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const user = request.authUser;

      if (!user) {
        throw AppError.unauthorized();
      }

      const servers = await listServers(user.id);

      return reply.send({
        success: true,
        data: {
          servers,
        },
      });
    }
  );

  app.get(
    "/:serverId",
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const user = request.authUser;

      if (!user) {
        throw AppError.unauthorized();
      }

      const parsed = serverParamsSchema.safeParse(
        request.params
      );

      if (!parsed.success) {
        throw AppError.badRequest(
          "Invalid server ID.",
          parsed.error.flatten()
        );
      }

      const server = await getServerById(
        user.id,
        parsed.data.serverId
      );

      return reply.send({
        success: true,
        data: {
          server,
        },
      });
    }
  );
}
