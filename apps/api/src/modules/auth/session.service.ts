import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";
import {
  createAccessToken,
  createRefreshToken
} from "./token.service.js";

const SESSION_DURATION_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  role: string
) {
  const refreshToken = createRefreshToken();
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  );

  const session = await prisma.session.create({
    data: {
      id: randomUUID(),
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt
    }
  });

  return {
    sessionId: session.id,
    refreshToken,
    accessToken: createAccessToken(userId, role)
  };
}

export async function refreshSession(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);

  const session = await prisma.session.findFirst({
    where: {
      tokenHash,
      expiresAt: { gt: new Date() }
    },
    include: {
      user: true
    }
  });

  if (!session || !session.user) {
    throw new AppError("Invalid or expired session.", 401, "INVALID_SESSION");
  }

  const newRefreshToken = createRefreshToken();

  await prisma.session.update({
    where: { id: session.id },
    data: {
      tokenHash: hashToken(newRefreshToken),
      expiresAt: new Date(
        Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
      )
    }
  });

  return {
    accessToken: createAccessToken(session.user.id, session.user.role),
    refreshToken: newRefreshToken
  };
}

export async function revokeSession(sessionId: string, userId: string) {
  await prisma.session.deleteMany({
    where: {
      id: sessionId,
      userId
    }
  });
}

export async function revokeAllSessions(userId: string) {
  await prisma.session.deleteMany({
    where: { userId }
  });
}
