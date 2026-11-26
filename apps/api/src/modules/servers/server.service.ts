import { Prisma } from "@prisma/client";
import { buildStartupCommand, resolveEggVariables } from "@matrixhost/egg-engine";
import { z } from "zod";

import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";

import type {
  CreateServerRequest,
} from "./server.schemas.js";

const MB = 1024 * 1024;

const eggScriptsSchema = z
  .object({
    privileged: z.boolean().optional(),
    install: z
      .object({
        container: z.string().optional(),
        entrypoint: z.string().optional(),
        script: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

function parseEggScripts(value: Prisma.JsonValue) {
  if (value === null) {
    return {};
  }

  const parsed = eggScriptsSchema.safeParse(value);

  if (!parsed.success) {
    throw AppError.badRequest(
      "Egg installer configuration is invalid.",
    );
  }

  return parsed.data;
}

const eggVariableSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    env_variable: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
    default_value: z
      .union([z.string(), z.number(), z.boolean(), z.null()])
      .optional(),
    user_viewable: z.boolean().optional(),
    user_editable: z.boolean().optional(),
    rules: z.string().optional(),
    field_type: z.string().optional(),
  })
  .passthrough();

function parseEggVariables(
  value: Prisma.JsonValue,
) {
  const parsed = z.array(eggVariableSchema).safeParse(value);

  if (!parsed.success) {
    throw AppError.badRequest(
      "Egg variables configuration is invalid.",
    );
  }

  return parsed.data;
}

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

  const image = values[0]!.trim();

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

      const eggScripts = parseEggScripts(egg.scripts);

      if (eggScripts.privileged === true) {
        throw AppError.forbidden(
          "Privileged Egg installation scripts are not permitted."
        );
      }

      if (eggScripts.install?.script?.trim()) {
        if (
          !eggScripts.install.container ||
          eggScripts.install.container.length > 255 ||
          Buffer.byteLength(eggScripts.install.script, "utf8") > 256 * 1024 ||
          eggScripts.install.script.includes("\0") ||
          (eggScripts.install.entrypoint !== undefined &&
            !/^(?:\/[a-zA-Z0-9_./-]{1,200}|[a-zA-Z0-9_.-]{1,64})$/.test(
              eggScripts.install.entrypoint,
            ))
        ) {
          throw AppError.badRequest(
            "Egg installer configuration is invalid or exceeds the supported limits.",
          );
        }
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
      const eggVariables = parseEggVariables(egg.variables);
      const allowedEnvironmentKeys = new Set(
        eggVariables.map((variable) => variable.env_variable),
      );
      const unknownEnvironmentKeys = Object.keys(
        input.environment,
      ).filter((key) => !allowedEnvironmentKeys.has(key));

      if (unknownEnvironmentKeys.length > 0) {
        throw AppError.badRequest(
          "Environment contains variables that are not defined by the selected Egg.",
          unknownEnvironmentKeys,
        );
      }

      const resolvedVariables = resolveEggVariables(
        eggVariables,
        input.environment,
      );

      if (!resolvedVariables.success) {
        throw AppError.badRequest(
          "Invalid Egg environment variables.",
          resolvedVariables.errors,
        );
      }

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

      // These values are controlled by the selected primary allocation,
      // not by customer-supplied Egg variables.
      const finalEnvironment = {
        ...resolvedVariables.environment,
        SERVER_IP: allocation.ipAddress,
        SERVER_PORT: String(allocation.port),
      };

      const startup = buildStartupCommand(
        egg.startupCommand,
        finalEnvironment,
      );

      if (!startup.success) {
        throw AppError.badRequest(
          "Egg startup command could not be resolved.",
          startup.errors,
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
          startupCommand: startup.command,

          memoryLimitBytes: memoryBytes,
          swapLimitBytes: swapBytes,
          diskLimitBytes: diskBytes,
          cpuLimit: requestedCpu,
          ioWeight: input.resources.ioWeight,

          databaseLimit: input.resources.databases,
          allocationLimit: input.resources.allocations,
          backupLimit: input.resources.backups,

          environment: finalEnvironment,
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

export async function deleteServer(
  userId: string,
  serverId: string,
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });

    if (!user || user.status !== "ACTIVE") {
      throw AppError.forbidden("Your account is not active.");
    }

    const isAdministrator =
      user.role === "SUPER_ADMIN" || user.role === "ADMIN";

    const server = await tx.server.findFirst({
      where: {
        id: serverId,
        status: { not: "DELETED" },
        ...(isAdministrator ? {} : { ownerId: user.id }),
      },
      select: { id: true, nodeId: true, status: true },
    });

    if (!server) {
      throw AppError.notFound("Server not found.");
    }

    if (!["RUNNING", "OFFLINE", "ERROR"].includes(server.status)) {
      throw AppError.conflict(
        "Server cannot be deleted while another operation is in progress.",
      );
    }

    const activeJobs = await tx.nodeJob.count({
      where: {
        serverId,
        status: { in: ["QUEUED", "DELIVERED", "RUNNING"] },
      },
    });

    if (activeJobs > 0) {
      throw AppError.conflict(
        "Wait for the current server operation to finish before deleting it.",
      );
    }

    await tx.server.update({
      where: { id: serverId },
      data: { status: "STOPPING" },
    });

    const job = await tx.nodeJob.create({
      data: {
        nodeId: server.nodeId,
        serverId,
        type: "DELETE_SERVER",
        status: "QUEUED",
        idempotencyKey: `delete-server:${serverId}:${Date.now()}`,
        payload: { serverId },
        maxAttempts: 5,
        availableAt: new Date(),
      },
      select: { id: true },
    });

    return {
      serverId,
      jobId: job.id,
      status: "STOPPING" as const,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10000,
    timeout: 15000,
  });
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
      status: { not: "DELETED" },
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
      ? { status: { not: "DELETED" } }
      : {
          ownerId: user.id,
          status: { not: "DELETED" },
        },

    select: serverResponseSelect,

    orderBy: {
      createdAt: "desc",
    },
  });
}
