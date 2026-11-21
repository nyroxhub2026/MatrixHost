import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";

import type {
  CreateNodeInput,
  UpdateNodeInput,
} from "./node.schemas.js";

const nodeSelect = {
  id: true,
  name: true,
  description: true,
  location: true,
  status: true,

  hostname: true,
  operatingSystem: true,
  architecture: true,
  cpuModel: true,
  cpuCores: true,

  memoryTotalBytes: true,
  memoryFreeBytes: true,
  swapTotalBytes: true,
  swapFreeBytes: true,
  diskTotalBytes: true,
  diskFreeBytes: true,

  cpuAllocatable: true,
  memoryAllocatableBytes: true,
  swapAllocatableBytes: true,
  diskAllocatableBytes: true,

  publicAddress: true,
  listenAddress: true,
  listenPort: true,
  tlsEnabled: true,

  memoryOverallocatePercent: true,
  diskOverallocatePercent: true,
  cpuOverallocatePercent: true,

  agentVersion: true,
  dockerVersion: true,
  lastHeartbeatAt: true,

  createdAt: true,
  updatedAt: true,
} as const;

function serializeNode<
  T extends Record<string, unknown>
>(node: T) {
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      typeof value === "bigint"
        ? value.toString()
        : value,
    ])
  );
}

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
    const node = await prisma.node.create({
      data: {
        name: input.name,
        publicAddress: input.publicAddress,
        listenAddress: input.listenAddress,
        listenPort: input.listenPort,
        tlsEnabled: input.tlsEnabled,

        cpuAllocatable:
          input.resources.cpuAllocatable,

        memoryAllocatableBytes: BigInt(
          input.resources.memoryAllocatableBytes
        ),

        swapAllocatableBytes: BigInt(
          input.resources.swapAllocatableBytes
        ),

        diskAllocatableBytes: BigInt(
          input.resources.diskAllocatableBytes
        ),
      },
      select: nodeSelect,
    });

    return serializeNode(node);
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

  return serializeNode(node);
}

export async function listNodes() {
  const nodes = await prisma.node.findMany({
    select: nodeSelect,
    orderBy: {
      createdAt: "desc",
    },
  });

  return nodes.map(serializeNode);
}

export async function updateNode(
  nodeId: string,
  input: UpdateNodeInput
) {
  const resources = input.resources;

  try {
    const node = await prisma.node.update({
      where: { id: nodeId },

      data: {
        ...(input.name !== undefined
          ? { name: input.name }
          : {}),

        ...(input.publicAddress !== undefined
          ? { publicAddress: input.publicAddress }
          : {}),

        ...(input.listenAddress !== undefined
          ? { listenAddress: input.listenAddress }
          : {}),

        ...(input.listenPort !== undefined
          ? { listenPort: input.listenPort }
          : {}),

        ...(input.tlsEnabled !== undefined
          ? { tlsEnabled: input.tlsEnabled }
          : {}),

        ...(resources !== undefined
          ? {
              cpuAllocatable:
                resources.cpuAllocatable,

              memoryAllocatableBytes: BigInt(
                resources.memoryAllocatableBytes
              ),

              swapAllocatableBytes: BigInt(
                resources.swapAllocatableBytes
              ),

              diskAllocatableBytes: BigInt(
                resources.diskAllocatableBytes
              ),
            }
          : {}),
      },

      select: nodeSelect,
    });

    return serializeNode(node);
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
