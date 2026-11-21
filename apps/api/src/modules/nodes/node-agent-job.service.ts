import { randomUUID } from "node:crypto";
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
    throw new Error(
      `Invalid or unsafe ${field} value.`,
    );
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
    throw new Error(
      "Server environment must be a JSON object.",
    );
  }

  const result: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (
      !/^[A-Z_][A-Z0-9_]*$/.test(key) ||
      typeof entry !== "string" ||
      entry.length > 4096
    ) {
      throw new Error(
        "Server contains an invalid environment variable.",
      );
    }

    result[key] = entry;
  }

  if (Object.keys(result).length > 100) {
    throw new Error(
      "Server has too many environment variables.",
    );
  }

  return result;
}

async function buildJobPayload(
  jobId: string,
): Promise<Record<string, unknown>> {
  const job = await prisma.nodeJob.findUnique({
    where: { id: jobId },
    include: {
      server: true,
    },
  });

  if (!job || !job.server) {
    throw new Error(
      "The server associated with this job was not found.",
    );
  }

  if (job.type !== "CREATE_SERVER") {
    return {};
  }

  const server = job.server;

  return {
    image: server.dockerImage,
    startup: server.startupCommand,
    environment: parseEnvironment(server.environment),
    limits: {
      memoryBytes: toSafeNumber(
        server.memoryLimitBytes,
        "memory",
      ),
      swapBytes: toSafeNumber(
        server.swapLimitBytes,
        "swap",
      ),
      diskBytes: toSafeNumber(
        server.diskLimitBytes,
        "disk",
      ),
      cpuPercent: server.cpuLimit * 100,
    },
  };
}

export async function claimNextNodeJob(
  nodeId: string,
  connectionId = randomUUID(),
): Promise<ClaimedAgentJob | null> {
  const now = new Date();

  // Expired jobs that exhausted their retry limit
  // must not remain stuck forever.
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
      errorMessage: "Job lease expired after maximum attempts.",
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
        {
          status: "QUEUED",
        },
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
    orderBy: [
      { availableAt: "asc" },
      { createdAt: "asc" },
    ],
  });

  if (!job) {
    return null;
  }

  // Compare updatedAt to avoid claiming the same job
  // from two concurrent WebSocket connections.
  const claimed = await prisma.nodeJob.updateMany({
    where: {
      id: job.id,
      updatedAt: job.updatedAt,
      OR: [
        {
          status: "QUEUED",
        },
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
    const payload = await buildJobPayload(job.id);

    return {
      id: job.id,
      type: job.type as SupportedJobType,
      serverId: job.serverId!,
      payload,
      attempt: job.attempts + 1,
    };
  } catch {
    await prisma.nodeJob.updateMany({
      where: {
        id: job.id,
        lockedBy: connectionId,
        status: "DELIVERED",
      },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        lockedBy: null,
        leaseExpiresAt: null,
        errorCode: "INVALID_JOB_CONFIGURATION",
        errorMessage:
          "The job configuration could not be prepared.",
      },
    });

    return null;
  }
}
