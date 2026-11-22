import { Prisma } from "@prisma/client";

import { prisma } from "@matrixhost/database";

const LEASE_DURATION_MS = 120_000;
const MAX_JOB_ATTEMPTS = 5;

const SUPPORTED_JOB_TYPES = [
  "CREATE_SERVER",
  "START_SERVER",
  "STOP_SERVER",
  "RESTART_SERVER",
  "KILL_SERVER",
  "DELETE_SERVER",
] as const;

type SupportedJobType =
  (typeof SUPPORTED_JOB_TYPES)[number];

export interface ClaimedAgentJob {
  id: string;
  type: SupportedJobType;
  serverId: string;
  payload: Record<string, unknown>;
  attempt: number;
}

function toSafeNumber(
  value: bigint,
  field: string,
): number {
  const result = Number(value);

  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`Invalid ${field} value.`);
  }

  return result;
}

function parseEnvironment(
  value: Prisma.JsonValue,
): Record<string, string> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error("Invalid server environment.");
  }

  const result: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (
      !/^[A-Z_][A-Z0-9_]*$/.test(key) ||
      typeof entry !== "string" ||
      entry.length > 4096
    ) {
      throw new Error("Invalid environment variable.");
    }

    result[key] = entry;
  }

  if (Object.keys(result).length > 100) {
    throw new Error("Too many environment variables.");
  }

  return result;
}

async function buildJobPayload(
  job: {
    type: SupportedJobType;
    serverId: string | null;
    nodeId: string;
    server: {
      id: string;
      nodeId: string;
      dockerImage: string;
      startupCommand: string;
      environment: Prisma.JsonValue;
      memoryLimitBytes: bigint;
      swapLimitBytes: bigint;
      diskLimitBytes: bigint;
      cpuLimit: number;
      egg: {
        scripts: Prisma.JsonValue;
      };
      allocations: {
        ipAddress: string;
        port: number;
        protocol: "TCP" | "UDP";
        isPrimary: boolean;
      }[];
    } | null;
  },
): Promise<Record<string, unknown>> {
  if (!job.serverId || !job.server) {
    throw new Error("Associated server was not found.");
  }

  if (
    job.server.id !== job.serverId ||
    job.server.nodeId !== job.nodeId
  ) {
    throw new Error("Server-node relationship is invalid.");
  }

  if (job.type !== "CREATE_SERVER") {
    return {};
  }

  if (
    !Number.isFinite(job.server.cpuLimit) ||
    job.server.cpuLimit <= 0
  ) {
    throw new Error("Invalid CPU limit.");
  }

  const primaryAllocations = job.server.allocations.filter(
    (allocation) => allocation.isPrimary,
  );

  if (primaryAllocations.length !== 1) {
    throw new Error("Server must have exactly one primary allocation.");
  }

  const environment = parseEnvironment(job.server.environment);
  const eggScripts = job.server.egg.scripts;

  let installer:
    | {
        image: string;
        entrypoint?: string;
        script: string;
        environment: Record<string, string>;
      }
    | undefined;

  if (
    eggScripts !== null &&
    typeof eggScripts === "object" &&
    !Array.isArray(eggScripts)
  ) {
    const scripts = eggScripts as Prisma.JsonObject;
    const install = scripts.install;

    if (scripts.privileged === true) {
      throw new Error("Privileged Egg installers are not permitted.");
    }

    if (
      install !== null &&
      typeof install === "object" &&
      !Array.isArray(install)
    ) {
      const installConfig = install as Prisma.JsonObject;
      const script = installConfig.script;
      const image = installConfig.container;
      const entrypoint = installConfig.entrypoint;

      if (typeof script === "string" && script.trim().length > 0) {
        if (
          Buffer.byteLength(script, "utf8") > 256 * 1024 ||
          typeof image !== "string" ||
          image.length === 0 ||
          image.length > 255 ||
          (entrypoint !== undefined &&
            (typeof entrypoint !== "string" ||
              !/^(?:\/[a-zA-Z0-9_./-]{1,200}|[a-zA-Z0-9_.-]{1,64})$/.test(entrypoint)))
        ) {
          throw new Error("Egg installer configuration is invalid.");
        }

        installer = {
          image,
          ...(typeof entrypoint === "string" ? { entrypoint } : {}),
          script,
          environment,
        };
      }
    }
  }

  return {
    image: job.server.dockerImage,
    startup: job.server.startupCommand,
    environment,
    ports: primaryAllocations.map((allocation) => ({
      hostIp: allocation.ipAddress,
      hostPort: allocation.port,
      containerPort: allocation.port,
      protocol: allocation.protocol.toLowerCase(),
    })),
    limits: {
      memoryBytes: toSafeNumber(
        job.server.memoryLimitBytes,
        "memory",
      ),
      swapBytes: toSafeNumber(
        job.server.swapLimitBytes,
        "swap",
      ),
      diskBytes: toSafeNumber(
        job.server.diskLimitBytes,
        "disk",
      ),
      cpuPercent: job.server.cpuLimit * 100,
    },
    ...(installer ? { install: installer } : {}),
  };
}

async function failInvalidJob(
  jobId: string,
  nodeId: string,
  connectionId: string,
  serverId: string | null,
  type: SupportedJobType,
): Promise<void> {
  const now = new Date();

  await prisma.$transaction(async (transaction) => {
    await transaction.nodeJob.updateMany({
      where: {
        id: jobId,
        nodeId,
        lockedBy: connectionId,
        status: "DELIVERED",
      },
      data: {
        status: "FAILED",
        finishedAt: now,
        lockedBy: null,
        leaseExpiresAt: null,
        errorCode: "INVALID_JOB_CONFIGURATION",
        errorMessage:
          "The job configuration could not be prepared.",
      },
    });

    if (type === "CREATE_SERVER" && serverId) {
      await transaction.server.updateMany({
        where: {
          id: serverId,
          nodeId,
          status: "INSTALLING",
        },
        data: {
          status: "ERROR",
        },
      });

      await transaction.nodeResourceReservation.updateMany({
        where: {
          serverId,
          nodeId,
          status: "ACTIVE",
        },
        data: {
          status: "RELEASED",
          releasedAt: now,
        },
      });

      await transaction.allocation.updateMany({
        where: {
          serverId,
          nodeId,
        },
        data: {
          serverId: null,
          isPrimary: false,
        },
      });
    }
  });
}

export async function claimNextNodeJob(
  nodeId: string,
  connectionId: string,
): Promise<ClaimedAgentJob | null> {
  const now = new Date();

  await prisma.nodeJob.updateMany({
    where: {
      nodeId,
      status: {
        in: ["DELIVERED", "RUNNING"],
      },
      leaseExpiresAt: {
        lt: now,
      },
      attempts: {
        gte: MAX_JOB_ATTEMPTS,
      },
    },
    data: {
      status: "FAILED",
      finishedAt: now,
      lockedBy: null,
      leaseExpiresAt: null,
      errorCode: "JOB_LEASE_EXPIRED",
      errorMessage:
        "Job lease expired after maximum attempts.",
    },
  });

  const job = await prisma.nodeJob.findFirst({
    where: {
      nodeId,
      type: {
        in: [...SUPPORTED_JOB_TYPES],
      },
      attempts: {
        lt: MAX_JOB_ATTEMPTS,
      },
      availableAt: {
        lte: now,
      },
      OR: [
        { status: "QUEUED" },
        {
          status: {
            in: ["DELIVERED", "RUNNING"],
          },
          leaseExpiresAt: {
            lt: now,
          },
        },
      ],
    },
    include: {
      server: {
        include: {
          egg: {
            select: {
              scripts: true,
            },
          },
          allocations: {
            where: {
              isPrimary: true,
            },
            select: {
              ipAddress: true,
              port: true,
              protocol: true,
              isPrimary: true,
            },
          },
        },
      },
    },
    orderBy: [
      { availableAt: "asc" },
      { createdAt: "asc" },
    ],
  });

  if (!job) {
    return null;
  }

  const claimed = await prisma.nodeJob.updateMany({
    where: {
      id: job.id,
      nodeId,
      updatedAt: job.updatedAt,
      OR: [
        { status: "QUEUED" },
        {
          status: {
            in: ["DELIVERED", "RUNNING"],
          },
          leaseExpiresAt: {
            lt: now,
          },
        },
      ],
    },
    data: {
      status: "DELIVERED",
      attempts: {
        increment: 1,
      },
      deliveredAt: now,
      lockedBy: connectionId,
      leaseExpiresAt: new Date(
        now.getTime() + LEASE_DURATION_MS,
      ),
    },
  });

  if (claimed.count !== 1) {
    return null;
  }

  try {
    if (!job.serverId || !job.server) {
      throw new Error("Server is missing.");
    }

    const payload = await buildJobPayload({
      type: job.type as SupportedJobType,
      serverId: job.serverId,
      nodeId: job.nodeId,
      server: job.server,
    });

    return {
      id: job.id,
      type: job.type as SupportedJobType,
      serverId: job.serverId,
      payload,
      attempt: job.attempts + 1,
    };
  } catch {
    await failInvalidJob(
      job.id,
      nodeId,
      connectionId,
      job.serverId,
      job.type as SupportedJobType,
    );

    return null;
  }
}
