import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";

import type {
  ChangePasswordInput,
  UpdateProfileInput,
} from "./user.schemas.js";

import {
  hashPassword,
  verifyPassword,
} from "../auth/password.service.js";

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

const publicUserSelect = {
  id: true,
  email: true,
  username: true,
  role: true,
  status: true,
  emailVerified: true,
  createdAt: true,
} as const;

export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: publicUserSelect,
  });

  if (!user) {
    throw AppError.notFound("User not found.");
  }

  return user;
}

export async function updateUserProfile(
  userId: string,
  input: UpdateProfileInput
) {
  try {
    return await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        ...(input.username !== undefined
          ? { username: input.username }
          : {}),
      },
      select: publicUserSelect,
    });
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      throw new AppError(
        "Username is already taken.",
        409,
        "USERNAME_EXISTS"
      );
    }

    if (isPrismaError(error, "P2025")) {
      throw AppError.notFound("User not found.");
    }

    throw error;
  }
}

export async function changeUserPassword(
  userId: string,
  input: ChangePasswordInput
) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      passwordHash: true,
    },
  });

  if (!user) {
    throw AppError.notFound("User not found.");
  }

  const valid = await verifyPassword(
    input.currentPassword,
    user.passwordHash
  );

  if (!valid) {
    throw new AppError(
      "Current password is incorrect.",
      400,
      "INVALID_CURRENT_PASSWORD"
    );
  }

  const passwordHash = await hashPassword(
    input.newPassword
  );

  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: {
        id: userId,
        passwordHash: user.passwordHash,
      },
      data: {
        passwordHash,
      },
    });

    if (updated.count !== 1) {
      throw AppError.conflict(
        "Password was changed by another request. Please try again."
      );
    }

    await tx.session.deleteMany({
      where: {
        userId,
      },
    });
  });

  return {
    success: true,
    message: "Password changed. Please log in again.",
  };
}
