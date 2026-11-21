import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/authentication.js";
import {
  changePasswordSchema,
  updateProfileSchema
} from "./user.schemas.js";
import {
  changeUserPassword,
  getUserProfile,
  updateUserProfile
} from "./user.service.js";

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/users/me",
    { preHandler: authenticate },
    async (request) => {
      return {
        user: await getUserProfile(request.authUser!.id)
      };
    }
  );

  app.patch(
    "/users/me",
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = updateProfileSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid profile data."
          }
        });
      }

      return {
        user: await updateUserProfile(
          request.authUser!.id,
          parsed.data
        )
      };
    }
  );

  app.post(
    "/users/me/password",
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = changePasswordSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid password data."
          }
        });
      }

      await changeUserPassword(
        request.authUser!.id,
        parsed.data
      );

      return reply.send({ success: true });
    }
  );
}
