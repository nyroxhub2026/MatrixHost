import {
  createHash,
  randomUUID,
} from "node:crypto";

import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";

import {
  createAccessToken,
  createRefreshToken,
} from "./token.service.js";

const SESSION_DURATION_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function getExpirationDate(): Date {
  return new Date(
    Date.now() +
      SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  );
}

export async function createSession(
  userId: string,
  role: string
) {
  if (
    typeof userId !== "string" ||
    userId.length === 0 ||
    typeof role !== "string" ||
    role.length === 0
  ) {
    throw new Error("Invalid session data.");
  }

  const refreshToken = createRefreshToken();
  const sessionId = randomUUID();

  // Create the access token before writing to the database.
  const accessToken = createAccessToken(
    userId,
    role,
    sessionId
  );

  const session = await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      refreshHash: hashToken(refreshToken),
      expiresAt: getExpirationDate(),
    },
  });

  return {
    sessionId: session.id,
    refreshToken,
    accessToken,
  };
}

export async function refreshSession(
  refreshToken: string
) {
  if (
    typeof refreshToken !== "string" ||
    refreshToken.length < 32 ||
    refreshToken.length > 256
  ) {
    throw new AppError(
      "Invalid refresh token.",
      401,
      "INVALID_SESSION"
    );
  }

  const currentHash = hashToken(refreshToken);

  const session = await prisma.session.findFirst({
    where: {
      refreshHash: currentHash,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          status: true,
          emailVerified: true,
        },
      },
    },
  });

  if (!session) {
    throw new AppError(
      "Invalid or expired session.",
      401,
      "INVALID_SESSION"
    );
  }

  if (
    session.user.status !== "ACTIVE" ||
    !session.user.emailVerified
  ) {
    await prisma.session.deleteMany({
      where: {
        id: session.id,
        userId: session.userId,
      },
    });

    throw AppError.forbidden(
      "Your account is not active or verified."
    );
  }

  const newRefreshToken = createRefreshToken();
  const newHash = hashToken(newRefreshToken);

  // Prepare the access token before rotating the refresh token.
  const accessToken = createAccessToken(
    session.user.id,
    session.user.role,
    session.id
  );

  const updated = await prisma.session.updateMany({
    where: {
      id: session.id,
      userId: session.userId,
      refreshHash: currentHash,
      expiresAt: {
        gt: new Date(),
      },
    },
    data: {
      refreshHash: newHash,
      expiresAt: getExpirationDate(),
    },
  });

  if (updated.count !== 1) {
    throw new AppError(
      "Session has already been refreshed or revoked.",
      401,
      "SESSION_REUSED"
    );
  }

  return {
    sessionId: session.id,
    accessToken,
    refreshToken: newRefreshToken,
  };
}

export async function revokeSession(
  sessionId: string,
  userId: string
): Promise<void> {
  await prisma.session.deleteMany({
    where: {
      id: sessionId,
      userId,
    },
  });
}

export async function revokeAllSessions(
  userId: string
): Promise<void> {
  await prisma.session.deleteMany({
    where: {
      userId,
    },
  });
}
