import {
  createHash,
  randomBytes,
} from "node:crypto";

import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";

function hashCredential(
  credential: string
): string {
  return createHash("sha256")
    .update(credential, "utf8")
    .digest("hex");
}

export async function createNodeAgentCredential(
  nodeId: string
) {
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    select: { id: true },
  });

  if (!node) {
    throw AppError.notFound("Node not found.");
  }

  const credential = randomBytes(48).toString("base64url");
  const credentialHash = hashCredential(credential);

  await prisma.nodeAgentCredential.upsert({
    where: { nodeId },
    create: {
      nodeId,
      credentialHash,
    },
    update: {
      credentialHash,
      revokedAt: null,
    },
  });

  return {
    nodeId,
    credential,
    warning:
      "Save this credential securely. It cannot be retrieved again.",
  };
}

export async function revokeNodeAgentCredential(
  nodeId: string
): Promise<void> {
  const result = await prisma.nodeAgentCredential.updateMany({
    where: {
      nodeId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  if (result.count === 0) {
    throw AppError.notFound(
      "Active Agent credential not found."
    );
  }
}
