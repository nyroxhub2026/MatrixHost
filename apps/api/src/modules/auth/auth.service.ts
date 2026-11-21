import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";
import type { RegisterInput, LoginInput } from "./auth.schemas.js";
import { hashPassword, verifyPassword } from "./password.service.js";
import {
  createAccessToken,
  createRefreshToken
} from "./token.service.js";

export async function registerUser(input: RegisterInput) {
  const email = input.email.toLowerCase();

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        { username: input.username }
      ]
    }
  });

  if (existing) {
    throw new AppError(
      "An account with this email or username already exists.",
      409,
      "ACCOUNT_EXISTS"
    );
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email,
      username: input.username,
      passwordHash,
      role: "CUSTOMER"
    },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      createdAt: true
    }
  });

  return user;
}

export async function loginUser(input: LoginInput) {
  const email = input.email.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
  }

  const accessToken = createAccessToken(user.id, user.role);
  const refreshToken = createRefreshToken();

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role
    },
    accessToken,
    refreshToken
  };
}
