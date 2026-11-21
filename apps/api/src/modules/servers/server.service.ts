import { Prisma, ServerStatus } from "@prisma/client";
import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";
import type { CreateServerRequest } from "./server.schemas";

const MB = 1024 * 1024;

function toBytes(valueMb: number): bigint {
  return BigInt(Math.floor(valueMb * MB));
}

function getDockerImage(images: Prisma.JsonValue): string {
  if (
    images === null ||
    typeof images !== "object" ||
    Array.isArray(images)
  ) {
    throw AppError.badRequest("Egg Docker images configuration is invalid");
  }

  const values = Object.values(images);

  const image = values.find(
    (value): value is string =>
      typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= 512
  );

  if (!image) {
    throw AppError.badRequest("Egg has no valid Docker image");
  }

  return image.trim();
}

function assertResourceLimit(
  requested: bigint,
  allocatable: bigint | null,
  alreadyReserved: bigint,
  resourceName: string
): void {
  if (allocatable === null || allocatable <= 0n) {
    throw AppError.conflict(
      `Node administrator has not configured ${resourceName} capacity`
    );
  }

  if (alreadyReserved + requested > allocatable) {
    throw AppError.conflict(
      `Node does not have enough allocatable ${resourceName} capacity`
    );
  }
}

export async function createServer(
  userId: string,
  input: CreateServerRequest
) {
  const memoryBytes = toBytes(input.resources.memory);
  const swapBytes = toBytes(input.resources.swap);
  const diskBytes = toBytes(input.resources.disk);

  if (!Number.isFinite(input.resources.cpu) || input.resources.cpu <= 0) {
    throw AppError.badRequest("Invalid CPU allocation");
  }

  return prisma.$transaction(
    async (tx) => {
      const [user, egg] = await Promise.all([
        tx.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            role: true,
            status: true
          }
        }),
        tx.egg.findUnique({
          where: { id: input.eggId }
        })
      ]);

      if (!user || user.status !== "ACTIVE") {
        throw AppError.forbidden("Your account is not active");
      }

      if (!egg) {
        throw AppError.notFound("Egg not found");
      }

      if (!egg.supported) {
        throw AppError.conflict(
          "This Egg is not supported by MatrixHost compatibility engine"
        );
      }

      const node = input.nodeId
        ? await tx.node.findUnique({
            where: { id: input.nodeId }
          })
        : await tx.node.findFirst({
            where: { status: "ONLINE" },
            orderBy: { createdAt: "asc" }
          });

      if (!node) {
        throw AppError.notFound("No suitable node was found");
      }

      if (node.status !== "ONLINE") {
        throw AppError.conflict("Selected node is not online");
      }

      if (
        node.cpuAllocatable === null ||
        node.cpuAllocatable <= 0
      ) {
        throw AppError.conflict(
          "Node CPU capacity has not been configured by an administrator"
        );
      }

      const requestedCpu = input.resources.cpu;

      const existingServers = await tx.server.findMany({
        where: {
          nodeId: node.id,
          status: {
            not: "ERROR"
          }
        },
        select: {
          cpuLimit: true,
          memoryLimitBytes: true,
          diskLimitBytes: true
        }
      });

      const reservedCpu = existingServers.reduce(
        (total, server) => total + server.cpuLimit,
        0
      );

      const reservedMemory = existingServers.reduce(
        (total, server) => total + server.memoryLimitBytes,
        0n
      );

      const reservedDisk = existingServers.reduce(
        (total, server) => total + server.diskLimitBytes,
        0n
      );

      if (reservedCpu + requestedCpu > node.cpuAllocatable) {
        throw AppError.conflict(
          "Node does not have enough allocatable CPU capacity"
        );
      }

      assertResourceLimit(
        memoryBytes,
        node.memoryAllocatableBytes,
        reservedMemory,
        "memory"
      );

      assertResourceLimit(
        diskBytes,
        node.diskAllocatableBytes,
        reservedDisk,
        "disk"
      );

      const image = getDockerImage(egg.dockerImages);

      const allocation = input.allocationId
        ? await tx.allocation.findFirst({
            where: {
              id: input.allocationId,
              nodeId: node.id,
              serverId: null
            }
          })
        : await tx.allocation.findFirst({
            where: {
              nodeId: node.id,
              serverId: null
            },
            orderBy: {
              createdAt: "asc"
            }
          });

      if (!allocation) {
        throw AppError.conflict(
          "No available network allocation exists on this node"
        );
      }

      const server = await tx.server.create({
        data: {
          name: input.name,
          description: input.description,
          ownerId: user.id,
          nodeId: node.id,
          eggId: egg.id,
          status: "INSTALLING",
          dockerImage: image,
          startupCommand: egg.startupCommand,
          memoryLimitBytes: memoryBytes,
          swapLimitBytes: swapBytes,
          diskLimitBytes: diskBytes,
          cpuLimit: requestedCpu,
          ioWeight: input.resources.ioWeight,
          environment: input.environment
        }
      });

      const allocationUpdate = await tx.allocation.updateMany({
        where: {
          id: allocation.id,
          nodeId: node.id,
          serverId: null
        },
        data: {
          serverId: server.id,
          isPrimary: true
        }
      });

      if (allocationUpdate.count !== 1) {
        throw AppError.conflict(
          "Allocation was reserved by another request"
        );
      }

      return tx.server.findUniqueOrThrow({
        where: { id: server.id },
        include: {
          allocations: true,
          egg: {
            select: {
              id: true,
              name: true,
              category: true
            }
          },
          node: {
            select: {
              id: true,
              name: true,
              status: true
            }
          }
        }
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 10000
    }
  );
}

export async function getServerById(
  userId: string,
  serverId: string
) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: {
      allocations: true,
      egg: {
        select: {
          id: true,
          name: true,
          category: true
        }
      },
      node: {
        select: {
          id: true,
          name: true,
          status: true
        }
      }
    }
  });

  if (!server) {
    throw AppError.notFound("Server not found");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      status: true
    }
  });

  if (!user || user.status !== "ACTIVE") {
    throw AppError.forbidden("Your account is not active");
  }

  const isPrivileged =
    user.role === "SUPER_ADMIN" ||
    user.role === "ADMIN" ||
    user.role === "SUPPORT";

  if (!isPrivileged && server.ownerId !== user.id) {
    throw AppError.forbidden("You cannot access this server");
  }

  return server;
}

export async function listServers(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      status: true
    }
  });

  if (!user || user.status !== "ACTIVE") {
    throw AppError.forbidden("Your account is not active");
  }

  const isPrivileged =
    user.role === "SUPER_ADMIN" ||
    user.role === "ADMIN" ||
    user.role === "SUPPORT";

  return prisma.server.findMany({
    where: isPrivileged
      ? {}
      : {
          ownerId: user.id
        },
    include: {
      allocations: true,
      egg: {
        select: {
          id: true,
          name: true,
          category: true
        }
      },
      node: {
        select: {
          id: true,
          name: true,
          status: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}
