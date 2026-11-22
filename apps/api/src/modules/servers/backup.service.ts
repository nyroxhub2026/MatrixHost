import { Prisma } from "@prisma/client";
import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";

function isAdministrator(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

async function requireOwnedServer(userId: string, serverId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") throw AppError.forbidden("Your account is not active.");

  const server = await prisma.server.findFirst({
    where: {
      id: serverId,
      ...(isAdministrator(user.role) ? {} : { ownerId: user.id }),
    },
    select: { id: true, nodeId: true, status: true, backupLimit: true, diskLimitBytes: true },
  });
  if (!server) throw AppError.notFound("Server not found.");
  return server;
}

function serializeBackup<T extends { sizeBytes: bigint | null }>(backup: T) {
  return { ...backup, sizeBytes: backup.sizeBytes?.toString() ?? null };
}

export async function createServerBackup(userId: string, serverId: string, name: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
    if (!user || user.status !== "ACTIVE") throw AppError.forbidden("Your account is not active.");

    const server = await tx.server.findFirst({
      where: { id: serverId, ...(isAdministrator(user.role) ? {} : { ownerId: user.id }) },
      select: { id: true, nodeId: true, status: true, backupLimit: true },
    });
    if (!server) throw AppError.notFound("Server not found.");
    if (server.backupLimit < 1) throw AppError.conflict("Backups are not enabled for this server.");
    if (!["RUNNING", "OFFLINE"].includes(server.status)) throw AppError.conflict("Server is not in a state that allows backup creation.");

    const activeCount = await tx.backup.count({
      where: { serverId, status: { in: ["PENDING", "IN_PROGRESS", "COMPLETED", "RESTORING"] } },
    });
    if (activeCount >= server.backupLimit) throw AppError.conflict("The server has reached its backup limit.");

    const backup = await tx.backup.create({
      data: { serverId, name, status: "PENDING" },
      select: { id: true, serverId: true, name: true, status: true, storagePath: true, checksum: true, sizeBytes: true, isLocked: true, completedAt: true, createdAt: true },
    });
    await tx.nodeJob.create({
      data: {
        nodeId: server.nodeId,
        serverId,
        type: "CREATE_BACKUP",
        status: "QUEUED",
        idempotencyKey: `create-backup:${backup.id}`,
        payload: { backupId: backup.id },
        maxAttempts: 5,
        availableAt: new Date(),
      },
    });
    return serializeBackup(backup);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 15000 });
}

export async function listServerBackups(userId: string, serverId: string) {
  await requireOwnedServer(userId, serverId);
  const backups = await prisma.backup.findMany({
    where: { serverId },
    orderBy: { createdAt: "desc" },
    select: { id: true, serverId: true, name: true, status: true, storagePath: true, checksum: true, sizeBytes: true, isLocked: true, completedAt: true, createdAt: true },
  });
  return backups.map(serializeBackup);
}

export async function restoreServerBackup(userId: string, serverId: string, backupId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
    if (!user || user.status !== "ACTIVE") throw AppError.forbidden("Your account is not active.");

    const server = await tx.server.findFirst({
      where: { id: serverId, ...(isAdministrator(user.role) ? {} : { ownerId: user.id }) },
      select: { id: true, nodeId: true, status: true },
    });
    if (!server) throw AppError.notFound("Server not found.");
    if (!["RUNNING", "OFFLINE"].includes(server.status)) throw AppError.conflict("Server cannot be restored in its current state.");

    const backup = await tx.backup.findFirst({
      where: { id: backupId, serverId, status: "COMPLETED", storagePath: { not: null }, checksum: { not: null } },
      select: { id: true },
    });
    if (!backup) throw AppError.notFound("A completed backup was not found.");

    await tx.backup.update({
      where: { id: backup.id },
      data: { status: "RESTORING" },
    });
    await tx.server.update({
      where: { id: serverId },
      data: { status: "RESTORING" },
    });
    const job = await tx.nodeJob.create({
      data: {
        nodeId: server.nodeId,
        serverId,
        type: "RESTORE_BACKUP",
        status: "QUEUED",
        idempotencyKey: `restore-backup:${backup.id}:${Date.now()}`,
        payload: { backupId: backup.id, previousStatus: server.status },
        maxAttempts: 3,
        availableAt: new Date(),
      },
      select: { id: true },
    });
    return { jobId: job.id, backupId: backup.id, status: "RESTORING" as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 15000 });
}
