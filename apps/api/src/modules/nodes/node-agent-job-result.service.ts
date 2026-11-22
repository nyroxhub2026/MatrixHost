import { Prisma } from "@prisma/client";

import { prisma } from "@matrixhost/database";

const LEASE_DURATION_MS = 120_000;
const RETRY_DELAY_MS = 5_000;

export async function acknowledgeNodeJob(
  nodeId: string,
  connectionId: string,
  jobId: string,
  accepted: boolean,
): Promise<boolean> {
  const now = new Date();

  const result = await prisma.nodeJob.updateMany({
    where: {
      id: jobId,
      nodeId,
      lockedBy: connectionId,
      status: "DELIVERED",
    },
    data: accepted
      ? {
          status: "RUNNING",
          startedAt: now,
          leaseExpiresAt: new Date(
            now.getTime() + LEASE_DURATION_MS,
          ),
        }
      : {
          status: "QUEUED",
          availableAt: new Date(
            now.getTime() + RETRY_DELAY_MS,
          ),
          lockedBy: null,
          leaseExpiresAt: null,
          errorCode: "AGENT_REJECTED_JOB",
          errorMessage: "The Node Agent rejected the job.",
        },
  });

  return result.count === 1;
}

function toJsonValue(
  value: Record<string, unknown>,
): Prisma.InputJsonValue {
  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new Error("Invalid JSON result.");
  }

  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

function sanitizeErrorMessage(
  message: string,
): string {
  return message
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 1000);
}

export async function completeNodeJob(
  nodeId: string,
  connectionId: string,
  jobId: string,
  input: {
    success: boolean;
    result?: Record<string, unknown>;
    error?: {
      code: string;
      message: string;
    };
  },
): Promise<boolean> {
  const now = new Date();

  if (
    !input.success &&
    (!input.error ||
      typeof input.error.code !== "string" ||
      typeof input.error.message !== "string")
  ) {
    return false;
  }

  const data: Prisma.NodeJobUpdateManyMutationInput = {
    status: input.success ? "SUCCEEDED" : "FAILED",
    finishedAt: now,
    lockedBy: null,
    leaseExpiresAt: null,
  };

  if (input.success) {
    if (input.result !== undefined) {
      data.result = toJsonValue(input.result);
    }

    data.errorCode = null;
    data.errorMessage = null;
  } else {
    data.errorCode = input.error!.code
      .replace(/[^A-Z0-9_]/gi, "_")
      .slice(0, 100);

    data.errorMessage = sanitizeErrorMessage(
      input.error!.message,
    );
  }

  return prisma.$transaction(async (transaction) => {
    const job = await transaction.nodeJob.findFirst({
      where: {
        id: jobId,
        nodeId,
        lockedBy: connectionId,
        status: {
          in: ["DELIVERED", "RUNNING"],
        },
      },
      select: {
        type: true,
        serverId: true,
      },
    });

    if (!job) {
      return false;
    }

    const updated = await transaction.nodeJob.updateMany({
      where: {
        id: jobId,
        nodeId,
        lockedBy: connectionId,
        status: {
          in: ["DELIVERED", "RUNNING"],
        },
      },
      data,
    });

    if (updated.count !== 1) {
      return false;
    }

    if (job.serverId) {
      let nextStatus:
        | "OFFLINE"
        | "RUNNING"
        | "ERROR"
        | undefined;

      if (!input.success && job.type === "CREATE_SERVER") {
        nextStatus = "ERROR";
      } else if (input.success) {
        switch (job.type) {
          case "CREATE_SERVER":
          case "STOP_SERVER":
          case "KILL_SERVER":
            nextStatus = "OFFLINE";
            break;
          case "START_SERVER":
          case "RESTART_SERVER":
            nextStatus = "RUNNING";
            break;
          default:
            break;
        }
      }

      if (nextStatus) {
        await transaction.server.updateMany({
          where: {
            id: job.serverId,
            nodeId,
          },
          data: {
            status: nextStatus,
            ...(input.success && job.type === "CREATE_SERVER"
              ? { installedAt: now }
              : {}),
            ...(input.success &&
            (job.type === "START_SERVER" ||
              job.type === "RESTART_SERVER")
              ? { lastStartedAt: now }
              : {}),
          },
        });
      }
    }

    return true;
  });
}

export async function extendNodeJobLease(
  nodeId: string,
  connectionId: string,
  jobId: string,
): Promise<boolean> {
  const result = await prisma.nodeJob.updateMany({
    where: {
      id: jobId,
      nodeId,
      lockedBy: connectionId,
      status: {
        in: ["DELIVERED", "RUNNING"],
      },
    },
    data: {
      leaseExpiresAt: new Date(
        Date.now() + LEASE_DURATION_MS,
      ),
    },
  });

  return result.count === 1;
}
