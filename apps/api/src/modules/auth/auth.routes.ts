import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/authentication.js";
import {
  loginSchema,
  registerSchema
} from "./auth.schemas.js";
import {
  loginUser,
  registerUser
} from "./auth.service.js";
import {
  createSession,
  refreshSession,
  revokeSession
} from "./session.service.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid registration data."
        }
      });
    }

    const user = await registerUser(parsed.data);

    return reply.status(201).send({ user });
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid login data."
        }
      });
    }

    const result = await loginUser(parsed.data);
    const session = await createSession(
      result.user.id,
      result.user.role
    );

    return reply.send({
      user: result.user,
      sessionId: session.sessionId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken
    });
  });

  app.post("/auth/refresh", async (request, reply) => {
    const body = request.body as { refreshToken?: unknown };

    if (
      typeof body?.refreshToken !== "string" ||
      body.refreshToken.length < 32 ||
      body.refreshToken.length > 256
    ) {
      return reply.status(400).send({
        error: {
          code: "INVALID_REFRESH_TOKEN",
          message: "A valid refresh token is required."
        }
      });
    }

    const result = await refreshSession(body.refreshToken);

    return reply.send(result);
  });

  app.post(
    "/auth/logout",
    { preHandler: authenticate },
    async (request, reply) => {
      const body = request.body as { sessionId?: unknown };

      if (
        typeof body?.sessionId !== "string" ||
        body.sessionId.length > 128
      ) {
        return reply.status(400).send({
          error: {
            code: "INVALID_SESSION_ID",
            message: "A valid session ID is required."
          }
        });
      }

      await revokeSession(
        body.sessionId,
        request.authUser!.id
      );

      return reply.send({ success: true });
    }
  );
}
