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
        payload: true,
      },
    });

    if (!job) {
      return false;
    }

    const containerId =
      typeof input.result?.containerId === "string"
        ? input.result.containerId
        : undefined;

    const payload = job.payload !== null && typeof job.payload === "object" && !Array.isArray(job.payload)
      ? job.payload as Record<string, unknown>
      : {};
    const backupId = typeof payload.backupId === "string" ? payload.backupId : undefined;
    const backupStoragePath = typeof input.result?.storagePath === "string" ? input.result.storagePath : undefined;
    const backupChecksum = typeof input.result?.checksum === "string" ? input.result.checksum : undefined;
    const backupSize = input.result?.sizeBytes;
    const validCreateBackupResult =
      job.type !== "CREATE_BACKUP" ||
      !input.success ||
      (backupId !== undefined &&
        input.result?.backupId === backupId &&
        backupStoragePath === `${job.serverId}/${backupId}.tar` &&
        backupChecksum !== undefined &&
        /^[a-f0-9]{64}$/i.test(backupChecksum) &&
        typeof backupSize === "number" &&
        Number.isSafeInteger(backupSize) &&
        backupSize > 0);
    const validRestoreBackupResult =
      job.type !== "RESTORE_BACKUP" ||
      !input.success ||
      (backupId !== undefined &&
        input.result?.backupId === backupId &&
        input.result?.restored === true &&
        backupChecksum !== undefined &&
        /^[a-f0-9]{64}$/i.test(backupChecksum));
    const validCreateResult =
      (job.type !== "CREATE_SERVER" ||
        !input.success ||
        (containerId !== undefined && /^[a-f0-9]{12,64}$/i.test(containerId))) &&
      validCreateBackupResult &&
      validRestoreBackupResult;

    const completionData:
      Prisma.NodeJobUpdateManyMutationInput = validCreateResult
        ? data
        : {
            ...data,
            status: "FAILED",
            errorCode: "INVALID_AGENT_RESULT",
            errorMessage:
              "The Agent returned an invalid result for this operation.",
          };

    const updated = await transaction.nodeJob.updateMany({
      where: {
        id: jobId,
        nodeId,
        lockedBy: connectionId,
        status: {
          in: ["DELIVERED", "RUNNING"],
        },
      },
      data: completionData,
    });

    if (updated.count !== 1) {
      return false;
    }

    if (job.type === "CREATE_BACKUP" && backupId && job.serverId) {
      await transaction.backup.updateMany({
        where: { id: backupId, serverId: job.serverId },
        data: input.success && validCreateBackupResult
          ? {
              status: "COMPLETED",
              storagePath: backupStoragePath!,
              checksum: backupChecksum!,
              sizeBytes: BigInt(backupSize as number),
              completedAt: now,
            }
          : { status: "FAILED" },
      });
    }

    if (job.type === "RESTORE_BACKUP" && backupId && job.serverId) {
      await transaction.backup.updateMany({
        where: { id: backupId, serverId: job.serverId, status: "RESTORING" },
        data: { status: "COMPLETED" },
      });
    }

    if (job.serverId) {
      let nextStatus:
        | "OFFLINE"
        | "RUNNING"
        | "ERROR"
        | undefined;

      if (
        job.type === "CREATE_SERVER" &&
        (!input.success || !validCreateResult)
      ) {
        nextStatus = "ERROR";
      } else if (job.type === "RESTORE_BACKUP") {
        nextStatus = input.success && validCreateResult ? "OFFLINE" : "ERROR";
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
            ...(input.success &&
            validCreateResult &&
            job.type === "CREATE_SERVER"
              ? {
                  installedAt: now,
                  containerId: containerId!,
                }
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
