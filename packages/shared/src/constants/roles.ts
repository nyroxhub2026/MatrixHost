export const USER_ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  SUPPORT: "SUPPORT",
  CUSTOMER: "CUSTOMER"
} as const;

export type UserRole =
  (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Administrator",
  ADMIN: "Administrator",
  SUPPORT: "Support",
  CUSTOMER: "Customer"
};

export const ROLE_LEVELS: Record<UserRole, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 80,
  SUPPORT: 50,
  CUSTOMER: 10
};

export function hasRoleLevel(
  userRole: UserRole,
  requiredRole: UserRole
): boolean {
  return ROLE_LEVELS[userRole] >= ROLE_LEVELS[requiredRole];
}

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    Object.values(USER_ROLES).includes(value as UserRole)
  );
}
