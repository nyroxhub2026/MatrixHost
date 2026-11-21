import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";
import type {
  ChangePasswordInput,
  UpdateProfileInput
} from "./user.schemas.js";
import {
  hashPassword,
  verifyPassword
} from "../auth/password.service.js";

export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      createdAt: true
    }
  });

  if (!user) {
    throw new AppError("User not found.", 404, "USER_NOT_FOUND");
  }

  return user;
}

export async function updateUserProfile(
  userId: string,
  input: UpdateProfileInput
) {
  if (input.username) {
    const existing = await prisma.user.findFirst({
      where: {
        username: input.username,
        NOT: { id: userId }
      }
    });

    if (existing) {
      throw new AppError("Username is already taken.", 409, "USERNAME_EXISTS");
    }
  }

  return prisma.user.update({
    where: { id: userId },
    data: input,
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      createdAt: true
    }
  });
}

export async function changeUserPassword(
  userId: string,
  input: ChangePasswordInput
) {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new AppError("User not found.", 404, "USER_NOT_FOUND");
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

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    }),
    prisma.session.deleteMany({
      where: { userId }
    })
  ]);

  return { success: true };
}
