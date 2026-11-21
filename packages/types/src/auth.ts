export type AuthProvider = "LOCAL" | "GOOGLE" | "GITHUB";

export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "CUSTOMER";
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

export interface AuthSession {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}
