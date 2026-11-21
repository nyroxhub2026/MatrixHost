import { PrismaClient } from "@prisma/client";

type PrismaGlobal = typeof globalThis & {
  matrixHostPrisma?: PrismaClient;
};

const prismaGlobal = globalThis as PrismaGlobal;

export const prisma =
  prismaGlobal.matrixHostPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  prismaGlobal.matrixHostPrisma = prisma;
}

export type {
  User,
  Node,
  Egg,
  Server,
  Session,
  Allocation,
  Backup,
  Schedule,
  ScheduleTask,
  ServerDatabase,
  ServerSubuser,
  SupportTicket,
  AuditLog
} from "@prisma/client";
