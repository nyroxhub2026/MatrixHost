
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";

import {
  verifyAccessToken,
} from "../modules/auth/token.service.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser: {
      id: string;
      role: string;
      sessionId: string;
    } | null;
  }

  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}

export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authorization = request.headers.authorization;

  if (
    typeof authorization !== "string" ||
    !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)
  ) {
    throw AppError.unauthorized();
  }

  const token = authorization.slice(7);
  const payload = verifyAccessToken(token);

  if (!payload) {
    throw new AppError(
      "Invalid or expired access token.",
      401,
      "INVALID_TOKEN"
    );
  }

  const session = await prisma.session.findFirst({
    where: {
      id: payload.sid,
      userId: payload.sub,
      expiresAt: {
        gt: new Date(),
      },
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          id: true,
          role: true,
          status: true,
          emailVerified: true,
        },
      },
    },
  });

  if (
    !session ||
    session.user.status !== "ACTIVE" ||
    !session.user.emailVerified
  ) {
    throw new AppError(
      "Session is invalid, expired or revoked.",
      401,
      "INVALID_SESSION"
    );
  }

  if (
    session.user.id !== payload.sub ||
    session.user.role !== payload.role
  ) {
    throw new AppError(
      "Access token is no longer valid.",
      401,
      "INVALID_TOKEN"
    );
  }

  request.authUser = {
    id: session.user.id,
    role: session.user.role,
    sessionId: session.id,
  };
}

export async function authenticationPlugin(
  app: FastifyInstance
): Promise<void> {
  app.decorateRequest("authUser", null);
  app.decorate("authenticate", authenticate);
}

export async function requireRoles(
  request: FastifyRequest,
  _reply: FastifyReply,
  allowedRoles: string[]
): Promise<void> {
  if (!request.authUser) {
    throw AppError.unauthorized();
  }

  if (!allowedRoles.includes(request.authUser.role)) {
    throw AppError.forbidden();
  }
}
