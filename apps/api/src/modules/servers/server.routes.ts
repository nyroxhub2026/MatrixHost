import type { FastifyInstance } from "fastify";
import {
  createServerSchema,
} from "./server.schemas";
import {
  createServer,
  getServerById,
  listServers,
} from "./server.service";
import { AppError } from "@matrixhost/shared";

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

      const parsed = createServerSchema.safeParse(request.body);

      if (!parsed.success) {
        throw AppError.badRequest(
          "Invalid server creation data",
          parsed.error.flatten()
        );
      }

      const server = await createServer(
        user.id,
        parsed.data
      );

      return reply.code(201).send({
        success: true,
        message: "Server record created successfully",
        data: server,
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
        data: servers,
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

      const params = request.params as {
        serverId: string;
      };

      const serverId = params.serverId;

      const server = await getServerById(
        user.id,
        serverId
      );

      return reply.send({
        success: true,
        data: server,
      });
    }
  );
}
