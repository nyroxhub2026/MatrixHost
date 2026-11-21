import { prisma } from "@matrixhost/database";

export interface HealthStatus {
  status: "ok" | "degraded";
  timestamp: string;
  services: {
    api: "ok";
    database: "ok" | "error";
  };
}

export async function getHealthStatus(): Promise<HealthStatus> {
  let databaseStatus: "ok" | "error" = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    databaseStatus = "error";
  }

  return {
    status: databaseStatus === "ok" ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      api: "ok",
      database: databaseStatus
    }
  };
}
