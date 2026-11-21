
import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";

function hashCredential(
  credential: string
): Buffer {
  return createHash("sha256")
    .update(credential, "utf8")
    .digest();
}

export async function authenticateNodeAgent(
  nodeId: string,
  credential: string
) {
  if (
    typeof nodeId !== "string" ||
    typeof credential !== "string" ||
    credential.length < 32 ||
    credential.length > 256
  ) {
    throw AppError.unauthorized(
      "Invalid Agent credentials."
    );
  }

  const node = await prisma.node.findUnique({
    where: {
      id: nodeId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!node) {
    throw AppError.unauthorized(
      "Invalid Agent credentials."
    );
  }

  const storedHash = await prisma.nodeAgentCredential.findUnique({
    where: {
      nodeId,
    },
    select: {
      credentialHash: true,
      revokedAt: true,
    },
  });

  if (
    !storedHash ||
    storedHash.revokedAt !== null
  ) {
    throw AppError.unauthorized(
      "Invalid Agent credentials."
    );
  }

  const suppliedHash = hashCredential(credential);

  const expectedHash = Buffer.from(
    storedHash.credentialHash,
    "hex"
  );

  if (
    expectedHash.length !== suppliedHash.length ||
    !timingSafeEqual(
      expectedHash,
      suppliedHash
    )
  ) {
    throw AppError.unauthorized(
      "Invalid Agent credentials."
    );
  }

  return {
    nodeId: node.id,
  };
}
