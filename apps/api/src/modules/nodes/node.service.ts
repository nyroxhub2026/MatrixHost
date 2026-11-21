import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";

import type {
  CreateNodeInput,
  UpdateNodeInput,
} from "./node.schemas.js";

const nodeSelect = {
  id: true,
  name: true,
  fqdn: true,
  scheme: true,
  port: true,
  status: true,
  cpuModel: true,
  cpuThreads: true,
  memoryTotalBytes: true,
  memoryFreeBytes: true,
  diskTotalBytes: true,
  diskFreeBytes: true,
  cpuAllocatable: true,
  memoryAllocatableBytes: true,
  swapAllocatableBytes: true,
  diskAllocatableBytes: true,
  dockerVersion: true,
  agentVersion: true,
  lastHeartbeatAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

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

export async function createNode(
  input: CreateNodeInput
) {
  try {
    return await prisma.node.create({
      data: {
        name: input.name,
        fqdn: input.fqdn,
        scheme: input.scheme,
        port: input.port,

        cpuAllocatable:
          input.resources.cpuAllocatable,

        memoryAllocatableBytes:
          BigInt(input.resources.memoryAllocatableBytes),

        swapAllocatableBytes:
          BigInt(input.resources.swapAllocatableBytes),

        diskAllocatableBytes:
          BigInt(input.resources.diskAllocatableBytes),
      },
      select: nodeSelect,
    });
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      throw new AppError(
        "A node with these details already exists.",
        409,
        "NODE_ALREADY_EXISTS"
      );
    }

    throw error;
  }
}

export async function getNodeById(
  nodeId: string
) {
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    select: nodeSelect,
  });

  if (!node) {
    throw AppError.notFound("Node not found.");
  }

  return node;
}

export async function listNodes() {
  return prisma.node.findMany({
    select: nodeSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function updateNode(
  nodeId: string,
  input: UpdateNodeInput
) {
  const resources = input.resources;

  try {
    return await prisma.node.update({
      where: { id: nodeId },
      data: {
        ...(input.name !== undefined
          ? { name: input.name }
          : {}),

        ...(input.fqdn !== undefined
          ? { fqdn: input.fqdn }
          : {}),

        ...(input.scheme !== undefined
          ? { scheme: input.scheme }
          : {}),

        ...(input.port !== undefined
          ? { port: input.port }
          : {}),

        ...(resources !== undefined
          ? {
              cpuAllocatable:
                resources.cpuAllocatable,

              memoryAllocatableBytes:
                BigInt(resources.memoryAllocatableBytes),

              swapAllocatableBytes:
                BigInt(resources.swapAllocatableBytes),

              diskAllocatableBytes:
                BigInt(resources.diskAllocatableBytes),
            }
          : {}),
      },
      select: nodeSelect,
    });
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      throw AppError.notFound("Node not found.");
    }

    if (isPrismaError(error, "P2002")) {
      throw new AppError(
        "A node with these details already exists.",
        409,
        "NODE_ALREADY_EXISTS"
      );
    }

    throw error;
  }
}
