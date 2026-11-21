import { Prisma } from "@prisma/client";

import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";

import type {
  CreateServerRequest,
} from "./server.schemas.js";

const MB = 1024 * 1024;

function toBytes(valueMb: number): bigint {
  if (!Number.isFinite(valueMb) || valueMb < 0) {
    throw AppError.badRequest("Invalid resource size.");
  }

  return BigInt(Math.floor(valueMb * MB));
}

function getDockerImage(images: Prisma.JsonValue): string {
  if (
    images === null ||
    typeof images !== "object" ||
    Array.isArray(images)
  ) {
    throw AppError.badRequest(
      "Egg Docker images configuration is invalid."
    );
  }

  const values = Object.values(images).filter(
    (value): value is string =>
      typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= 512
  );

  if (values.length !== 1) {
    throw AppError.conflict(
      "Egg must have exactly one configured Docker image. Multi-image selection is not supported yet."
    );
  }

  const image = values[0].trim();

  const imagePattern =
    /^(?:[a-z0-9.-]+(?::[0-9]{1,5})?\/)?[a-z0-9]+(?:[._/-][a-z0-9]+)*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(?:@sha256:[a-f0-9]{64})?$/;

  if (!imagePattern.test(image)) {
    throw AppError.badRequest(
      "Egg contains an invalid Docker image reference."
    );
  }

  return image;
}

function assertResourceLimit(
  requested: bigint,
  allocatable: bigint | null,
  reserved: bigint,
  resourceName: string
): void {
  if (requested === 0n) {
    return;
  }

  if (allocatable === null || allocatable <= 0n) {
    throw AppError.conflict(
      `Node administrator has not configured ${resourceName} capacity.`
    );
  }

  if (reserved + requested > allocatable) {
    throw AppError.conflict(
      `Node does not have enough allocatable ${resourceName} capacity.`
    );
  }
}

async function lockNode(
  tx: Prisma.TransactionClient,
  nodeId: string
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Node"
    WHERE "id" = ${nodeId}::uuid
    FOR UPDATE
  `;

  if (rows.length !== 1) {
    throw AppError.notFound("Node not found.");
  }
}

const serverResponseSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  dockerImage: true,
  memoryLimitBytes: true,
  swapLimitBytes: true,
  diskLimitBytes: true,
  cpuLimit: true,
  ioWeight: true,
  databaseLimit: true,
  allocationLimit: true,
  backupLimit: true,
  installedAt: true,
  suspendedAt: true,
  lastStartedAt: true,
  createdAt: true,
  updatedAt: true,

  allocations: {
    select: {
      id: true,
      ipAddress: true,
      port: true,
      protocol: true,
      isPrimary: true,
    },
  },

  egg: {
    select: {
      id: true,
      name: true,
      category: true,
    },
  },

  node: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
} satisfies Prisma.ServerSelect;

export async function createServer(
  userId: string,
  input: CreateServerRequest
) {
  const memoryBytes = toBytes(input.resources.memory);
  const swapBytes = toBytes(input.resources.swap);
  const diskBytes = toBytes(input.resources.disk);

  const requestedCpu = input.resources.cpu;

  if (
    !Number.isFinite(requestedCpu) ||
    requestedCpu <= 0
  ) {
    throw AppError.badRequest("Invalid CPU allocation.");
  }

  if (
    !Number.isInteger(input.resources.ioWeight) ||
    input.resources.ioWeight < 10 ||
    input.resources.ioWeight > 1000
  ) {
    throw AppError.badRequest("Invalid I/O weight.");
  }

  return prisma.$transaction(
    async (tx) => {
      const [user, egg] = await Promise.all([
        tx.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            role: true,
            status: true,
          },
        }),

        tx.egg.findUnique({
          where: { id: input.eggId },
        }),
      ]);

      if (!user || user.status !== "ACTIVE") {
        throw AppError.forbidden(
          "Your account is not active."
        );
      }

      if (!egg) {
        throw AppError.notFound("Egg not found.");
      }

      if (!egg.supported) {
        throw AppError.conflict(
          "This Egg is not supported by MatrixHost compatibility engine."
        );
      }

      const selectedNode = input.nodeId
        ? await tx.node.findUnique({
            where: { id: input.nodeId },
            select: { id: true },
          })
        : await tx.node.findFirst({
            where: { status: "ONLINE" },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          });

      if (!selectedNode) {
        throw AppError.notFound(
          "No suitable node was found."
        );
      }

      // Serialize resource reservations for this node.
      await lockNode(tx, selectedNode.id);

      const node = await tx.node.findUnique({
        where: { id: selectedNode.id },
      });

      if (!node) {
        throw AppError.notFound("Node not found.");
      }

      if (node.status !== "ONLINE") {
        throw AppError.conflict(
          "Selected node is not online."
        );
      }

      if (
        node.cpuAllocatable === null ||
        node.cpuAllocatable <= 0
      ) {
        throw AppError.conflict(
          "Node CPU capacity has not been configured by an administrator."
        );
      }

      const reservations =
        await tx.nodeResourceReservation.aggregate({
          where: {
            nodeId: node.id,
            status: "ACTIVE",
          },
          _sum: {
            cpu: true,
            memoryBytes: true,
            swapBytes: true,
            diskBytes: true,
          },
        });

      const reservedCpu = reservations._sum.cpu ?? 0;
      const reservedMemory =
        reservations._sum.memoryBytes ?? 0n;
      const reservedSwap =
        reservations._sum.swapBytes ?? 0n;
      const reservedDisk =
        reservations._sum.diskBytes ?? 0n;

      if (
        reservedCpu + requestedCpu >
        node.cpuAllocatable
      ) {
        throw AppError.conflict(
          "Node does not have enough allocatable CPU capacity."
        );
      }

      assertResourceLimit(
        memoryBytes,
        node.memoryAllocatableBytes,
        reservedMemory,
        "memory"
      );

      assertResourceLimit(
        swapBytes,
        node.swapAllocatableBytes,
        reservedSwap,
        "swap"
      );

      assertResourceLimit(
        diskBytes,
        node.diskAllocatableBytes,
        reservedDisk,
        "disk"
      );

      const image = getDockerImage(egg.dockerImages);

      // Multiple allocations are not implemented yet.
      if (input.resources.allocations !== 1) {
        throw AppError.conflict(
          "Multiple allocations per server are not supported yet."
        );
      }

      const allocation = input.allocationId
        ? await tx.allocation.findFirst({
            where: {
              id: input.allocationId,
              nodeId: node.id,
              serverId: null,
            },
          })
        : await tx.allocation.findFirst({
            where: {
              nodeId: node.id,
              serverId: null,
            },
            orderBy: {
              createdAt: "asc",
            },
          });

      if (!allocation) {
        throw AppError.conflict(
          "No available network allocation exists on this node."
        );
      }

      const server = await tx.server.create({
        data: {
          name: input.name,
          description: input.description,
          ownerId: user.id,
          nodeId: node.id,
          eggId: egg.id,

          // The Agent must confirm installation.
          status: "INSTALLING",

          dockerImage: image,
          startupCommand: egg.startupCommand,

          memoryLimitBytes: memoryBytes,
          swapLimitBytes: swapBytes,
          diskLimitBytes: diskBytes,
          cpuLimit: requestedCpu,
          ioWeight: input.resources.ioWeight,

          databaseLimit: input.resources.databases,
          allocationLimit: input.resources.allocations,
          backupLimit: input.resources.backups,

          environment: input.environment,
        },
      });

      await tx.nodeResourceReservation.create({
        data: {
          nodeId: node.id,
          serverId: server.id,
          cpu: requestedCpu,
          memoryBytes,
          swapBytes,
          diskBytes,
          status: "ACTIVE",
        },
      });

      const allocationUpdate =
        await tx.allocation.updateMany({
          where: {
            id: allocation.id,
            nodeId: node.id,
            serverId: null,
          },
          data: {
            serverId: server.id,
            isPrimary: true,
          },
        });

      if (allocationUpdate.count !== 1) {
        throw AppError.conflict(
          "Allocation was reserved by another request."
        );
      }

      // Only a server reference is placed in the job.
      // The Agent must retrieve and validate its configuration
      // through the authenticated Node protocol.
      await tx.nodeJob.create({
        data: {
          nodeId: node.id,
          serverId: server.id,
          type: "CREATE_SERVER",
          status: "QUEUED",
          idempotencyKey: `create-server:${server.id}`,
          payload: {
            serverId: server.id,
          },
          maxAttempts: 5,
          availableAt: new Date(),
        },
      });

      return tx.server.findUniqueOrThrow({
        where: { id: server.id },
        select: serverResponseSelect,
      });
    },
    {
      isolationLevel:
        Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10000,
      timeout: 15000,
    }
  );
}

export async function getServerById(
  userId: string,
  serverId: string
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      status: true,
    },
  });

  if (!user || user.status !== "ACTIVE") {
    throw AppError.forbidden(
      "Your account is not active."
    );
  }

  const isAdministrator =
    user.role === "SUPER_ADMIN" ||
    user.role === "ADMIN";

  const server = await prisma.server.findFirst({
    where: {
      id: serverId,
      ...(isAdministrator
        ? {}
        : { ownerId: user.id }),
    },
    select: serverResponseSelect,
  });

  if (!server) {
    throw AppError.notFound("Server not found.");
  }

  return server;
}

export async function listServers(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      status: true,
    },
  });

  if (!user || user.status !== "ACTIVE") {
    throw AppError.forbidden(
      "Your account is not active."
    );
  }

  const isAdministrator =
    user.role === "SUPER_ADMIN" ||
    user.role === "ADMIN";

  return prisma.server.findMany({
    where: isAdministrator
      ? {}
      : {
          ownerId: user.id,
        },

    select: serverResponseSelect,

    orderBy: {
      createdAt: "desc",
    },
  });
}
