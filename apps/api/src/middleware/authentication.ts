import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { AppError } from "@matrixhost/shared";
import { verifyAccessToken } from "../modules/auth/token.service.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser: {
      id: string;
      role: string;
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

  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError(
      "Authentication required.",
      401,
      "UNAUTHORIZED"
    );
  }

  const token = authorization.slice(7);
  const payload = verifyAccessToken(token);

  if (!payload) {
    throw new AppError(
      "Invalid or expired token.",
      401,
      "INVALID_TOKEN"
    );
  }

  request.authUser = {
    id: payload.sub,
    role: payload.role,
  };
}

export async function authenticationPlugin(
  app: FastifyInstance
): Promise<void> {
  app.decorateRequest("authUser", null);

  app.decorate(
    "authenticate",
    authenticate
  );
}

export async function requireRoles(
  request: FastifyRequest,
  _reply: FastifyReply,
  allowedRoles: string[]
): Promise<void> {
  if (!request.authUser) {
    throw new AppError(
      "Authentication required.",
      401,
      "UNAUTHORIZED"
    );
  }

  if (!allowedRoles.includes(request.authUser.role)) {
    throw new AppError(
      "Permission denied.",
      403,
      "FORBIDDEN"
    );
  }
}
