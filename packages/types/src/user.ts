export type UserRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "SUPPORT"
  | "CUSTOMER";

export type UserStatus =
  | "ACTIVE"
  | "PENDING"
  | "SUSPENDED"
  | "BANNED";

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  avatarUrl?: string;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
  role?: UserRole;
  status?: UserStatus;
  emailVerified?: boolean;
}

export interface PublicUser {
  id: string;
  username: string;
  role: UserRole;
  avatarUrl?: string;
}
