import type { FastifyInstance } from "fastify";

import { AppError } from "@matrixhost/shared";

import { authenticate } from "../../middleware/authentication.js";

import {
  changePasswordSchema,
  updateProfileSchema,
} from "./user.schemas.js";

import {
  changeUserPassword,
  getUserProfile,
  updateUserProfile,
} from "./user.service.js";

export async function userRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get(
    "/me",
    { preHandler: authenticate },
    async (request) => {
      const user = request.authUser;

      if (!user) {
        throw AppError.unauthorized();
      }

      return {
        success: true,
        data: {
          user: await getUserProfile(user.id),
        },
      };
    }
  );

  app.patch(
    "/me",
    { preHandler: authenticate },
    async (request) => {
      const user = request.authUser;

      if (!user) {
        throw AppError.unauthorized();
      }

      const parsed = updateProfileSchema.safeParse(
        request.body
      );

      if (!parsed.success) {
        throw AppError.badRequest(
          "Invalid profile data.",
          parsed.error.flatten()
        );
      }

      const updatedUser = await updateUserProfile(
        user.id,
        parsed.data
      );

      return {
        success: true,
        data: {
          user: updatedUser,
        },
      };
    }
  );

  app.post(
    "/me/password",
    { preHandler: authenticate },
    async (request) => {
      const user = request.authUser;

      if (!user) {
        throw AppError.unauthorized();
      }

      const parsed = changePasswordSchema.safeParse(
        request.body
      );

      if (!parsed.success) {
        throw AppError.badRequest(
          "Invalid password data.",
          parsed.error.flatten()
        );
      }

      const result = await changeUserPassword(
        user.id,
        parsed.data
      );

      return {
        success: true,
        data: result,
      };
    }
  );
}
