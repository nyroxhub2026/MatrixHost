import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppError } from "@matrixhost/shared";

import { createServerSchema } from "./server.schemas.js";

import {
  createServer,
  deleteServer,
  getServerById,
  listServers,
} from "./server.service.js";
import {
  createServerBackup,
  listServerBackups,
  restoreServerBackup,
} from "./backup.service.js";

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

  app.post(
    "/:serverId/backups",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.authUser;
      if (!user) throw AppError.unauthorized();
      const params = serverParamsSchema.safeParse(request.params);
      if (!params.success) throw AppError.badRequest("Invalid server ID.");
      const body = z.object({ name: z.string().trim().min(1).max(80).optional() }).strict().safeParse(request.body ?? {});
      if (!body.success) throw AppError.badRequest("Invalid backup name.");
      const backup = await createServerBackup(user.id, params.data.serverId, body.data.name ?? `Backup ${new Date().toISOString()}`);
      return reply.code(202).send({ success: true, message: "Backup job has been queued.", data: { backup } });
    },
  );

  app.get(
    "/:serverId/backups",
    { preHandler: [app.authenticate] },
    async (request) => {
      const user = request.authUser;
      if (!user) throw AppError.unauthorized();
      const params = serverParamsSchema.safeParse(request.params);
      if (!params.success) throw AppError.badRequest("Invalid server ID.");
      const backups = await listServerBackups(user.id, params.data.serverId);
      return { success: true, data: { backups } };
    },
  );

  app.post(
    "/:serverId/backups/:backupId/restore",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.authUser;
      if (!user) throw AppError.unauthorized();
      const params = z.object({ serverId: z.uuid(), backupId: z.uuid() }).strict().safeParse(request.params);
      if (!params.success) throw AppError.badRequest("Invalid server or backup ID.");
      const result = await restoreServerBackup(user.id, params.data.serverId, params.data.backupId);
      return reply.code(202).send({ success: true, message: "Restore job has been queued. The server will remain offline after restoration.", data: result });
    },
  );

}
