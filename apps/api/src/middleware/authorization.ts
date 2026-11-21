import type { FastifyRequest } from "fastify";
import { AppError } from "@matrixhost/shared";

export type Permission =
  | "users.read"
  | "users.manage"
  | "servers.read"
  | "servers.create"
  | "servers.manage"
  | "nodes.read"
  | "nodes.manage"
  | "eggs.read"
  | "eggs.manage"
  | "billing.manage"
  | "support.manage";

const rolePermissions: Record<string, Permission[]> = {
  SUPER_ADMIN: [
    "users.read",
    "users.manage",
    "servers.read",
    "servers.create",
    "servers.manage",
    "nodes.read",
    "nodes.manage",
    "eggs.read",
    "eggs.manage",
    "billing.manage",
    "support.manage"
  ],
  ADMIN: [
    "users.read",
    "servers.read",
    "servers.create",
    "servers.manage",
    "nodes.read",
    "eggs.read",
    "support.manage"
  ],
  SUPPORT: [
    "users.read",
    "servers.read",
    "support.manage"
  ],
  CUSTOMER: [
    "servers.read",
    "servers.create"
  ]
};

export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest): Promise<void> => {
    const user = request.authUser;

    if (!user) {
      throw new AppError("Authentication required.", 401, "UNAUTHORIZED");
    }

    const permissions = rolePermissions[user.role] ?? [];

    if (!permissions.includes(permission)) {
      throw new AppError("Permission denied.", 403, "FORBIDDEN");
    }
  };
}
