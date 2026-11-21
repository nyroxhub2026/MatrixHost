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

export type Role =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "SUPPORT"
  | "CUSTOMER";

const rolePermissions: Record<
  Role,
  readonly Permission[]
> = {
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

function isRole(value: string): value is Role {
  return Object.hasOwn(rolePermissions, value);
}

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

    if (!isRole(user.role)) {
      throw AppError.forbidden(
        "Invalid account role."
      );
    }

    const permissions = rolePermissions[user.role];

    if (!permissions.includes(permission)) {
      throw AppError.forbidden(
        "Permission denied."
      );
    }
  };
}
