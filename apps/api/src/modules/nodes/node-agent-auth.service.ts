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
): Promise<{ nodeId: string }> {
  if (
    typeof nodeId !== "string" ||
    typeof credential !== "string" ||
    credential.length < 32 ||
    credential.length > 256
  ) {
    throw new AppError(
      "Invalid Agent credentials.",
      401,
      "INVALID_AGENT_CREDENTIALS"
    );
  }

  const stored = await prisma.nodeAgentCredential.findUnique({
    where: { nodeId },
    select: {
      credentialHash: true,
      revokedAt: true,
    },
  });

  if (!stored || stored.revokedAt !== null) {
    throw new AppError(
      "Invalid Agent credentials.",
      401,
      "INVALID_AGENT_CREDENTIALS"
    );
  }

  if (!/^[a-f0-9]{64}$/i.test(stored.credentialHash)) {
    throw new AppError(
      "Invalid Agent credentials.",
      401,
      "INVALID_AGENT_CREDENTIALS"
    );
  }

  const suppliedHash = hashCredential(credential);
  const expectedHash = Buffer.from(
    stored.credentialHash,
    "hex"
  );

  if (!timingSafeEqual(expectedHash, suppliedHash)) {
    throw new AppError(
      "Invalid Agent credentials.",
      401,
      "INVALID_AGENT_CREDENTIALS"
    );
  }

  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    select: { id: true },
  });

  if (!node) {
    throw new AppError(
      "Node not found.",
      401,
      "INVALID_AGENT_CREDENTIALS"
    );
  }

  return { nodeId: node.id };
}
