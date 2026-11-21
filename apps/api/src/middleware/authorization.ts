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

type Role =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "SUPPORT"
  | "CUSTOMER";

const rolePermissions: Record<Role, readonly Permission[]> = {
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
    "support.manage",
  ],

  ADMIN: [
    "users.read",
    "users.manage",
    "servers.read",
    "servers.create",
    "servers.manage",
    "nodes.read",
    "nodes.manage",
    "eggs.read",
    "eggs.manage",
    "support.manage",
  ],

  SUPPORT: [
    "users.read",
    "servers.read",
    "support.manage",
  ],

  CUSTOMER: [
    "servers.read",
    "servers.create",
  ],
};

export function requirePermission(
  permission: Permission
) {
  return async (
    request: FastifyRequest
  ): Promise<void> => {
    const user = request.authUser;

    if (!user) {
      throw AppError.unauthorized();
    }

    const role = user.role as Role;

    if (
      !Object.hasOwn(rolePermissions, role) ||
      !rolePermissions[role].includes(permission)
    ) {
      throw AppError.forbidden("Permission denied.");
    }
  };
}
