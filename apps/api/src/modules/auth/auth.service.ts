
import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";

import type {
  RegisterInput,
  LoginInput,
} from "./auth.schemas.js";

import {
  hashPassword,
  verifyPassword,
} from "./password.service.js";

import {
  createSession,
} from "./session.service.js";

function isPrismaError(
  error: unknown,
  code: string
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

export async function registerUser(
  input: RegisterInput
) {
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim();

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        { username },
      ],
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    throw new AppError(
      "An account with this email or username already exists.",
      409,
      "ACCOUNT_EXISTS"
    );
  }

  const passwordHash = await hashPassword(
    input.password
  );

  try {
    return await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        role: "CUSTOMER",
        status: "PENDING",
        emailVerified: false,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        status: true,
        emailVerified: true,
        createdAt: true,
      },
    });
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      throw new AppError(
        "An account with this email or username already exists.",
        409,
        "ACCOUNT_EXISTS"
      );
    }

    throw error;
  }
}

export async function loginUser(
  input: LoginInput
) {
  const email = input.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    throw new AppError(
      "Invalid email or password.",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  const passwordIsValid = await verifyPassword(
    input.password,
    user.passwordHash
  );

  if (!passwordIsValid) {
    throw new AppError(
      "Invalid email or password.",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  if (user.status !== "ACTIVE") {
    throw AppError.forbidden(
      "Your account is not active."
    );
  }

  if (!user.emailVerified) {
    throw AppError.forbidden(
      "Please verify your email before logging in."
    );
  }

  const session = await createSession(
    user.id,
    user.role
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    },
    sessionId: session.sessionId,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
}
