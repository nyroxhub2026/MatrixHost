import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppError } from "@matrixhost/shared";

import { authenticate } from "../../middleware/authentication.js";

import {
  loginSchema,
  registerSchema,
} from "./auth.schemas.js";

import {
  loginUser,
  registerUser,
} from "./auth.service.js";

import {
  refreshSession,
  revokeSession,
} from "./session.service.js";

const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(256),
}).strict();

export async function authRoutes(
  app: FastifyInstance
): Promise<void> {
  app.post("/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);

    if (!parsed.success) {
      throw AppError.badRequest(
        "Invalid registration data.",
        parsed.error.flatten()
      );
    }

    const user = await registerUser(parsed.data);

    return reply.code(201).send({
      success: true,
      data: {
        user,
      },
    });
  });

  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      throw AppError.badRequest(
        "Invalid login data.",
        parsed.error.flatten()
      );
    }

    const result = await loginUser(parsed.data);

    return reply.send({
      success: true,
      data: result,
    });
  });

  app.post("/refresh", async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);

    if (!parsed.success) {
      throw AppError.badRequest(
        "A valid refresh token is required."
      );
    }

    const result = await refreshSession(
      parsed.data.refreshToken
    );

    return reply.send({
      success: true,
      data: result,
    });
  });

  app.post(
    "/logout",
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const user = request.authUser;

      if (!user) {
        throw AppError.unauthorized();
      }

      await revokeSession(
        user.sessionId,
        user.id
      );

      return reply.send({
        success: true,
        message: "Session revoked successfully.",
      });
    }
  );
}
