import type { DockerRuntime } from "../docker/docker-runtime.js";
import { JobManager } from "./job-manager.js";
import {
  createBackupJobPayloadSchema,
  createServerJobPayloadSchema,
  restoreBackupJobPayloadSchema,
} from "./job.schemas.js";
import type { AgentJob, AgentJobHandler, AgentJobType } from "./job.types.js";

const SUPPORTED_JOB_TYPES = [
  "CREATE_SERVER", "START_SERVER", "STOP_SERVER", "RESTART_SERVER",
  "KILL_SERVER", "DELETE_SERVER", "CREATE_BACKUP", "RESTORE_BACKUP",
] as const satisfies readonly AgentJobType[];

function getServerId(job: AgentJob): string {
  if (typeof job.serverId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(job.serverId)) {
    throw new Error("Invalid server ID.");
  }
  return job.serverId;
}

function createHandler(runtime: DockerRuntime, type: AgentJobType, defaultPidsLimit: number): AgentJobHandler {
  return {
    async execute(job, signal) {
      if (signal.aborted) throw new Error("Job was aborted.");
      const serverId = getServerId(job);

      switch (type) {
        case "CREATE_SERVER": {
          const parsed = createServerJobPayloadSchema.safeParse(job.payload);
          if (!parsed.success) throw new Error("Invalid server creation payload.");
          const payload = parsed.data;
          const memorySwapBytes = payload.limits.memoryBytes + payload.limits.swapBytes;
          if (!Number.isSafeInteger(memorySwapBytes)) throw new Error("Combined memory and swap limit is too large.");
          const created = await runtime.servers.create({
            serverId,
            image: payload.image,
            startupCommand: payload.startup,
            environment: payload.environment,
            limits: {
              memoryBytes: payload.limits.memoryBytes,
              memorySwapBytes,
              cpuPercent: payload.limits.cpuPercent,
              diskBytes: payload.limits.diskBytes,
              pidsLimit: defaultPidsLimit,
            },
            networkName: `matrixhost-${serverId}`,
            ports: payload.ports,
            installer: payload.install,
          }, signal);
          return { serverId, operation: type, containerId: created.containerId, networkName: created.networkName, completedAt: new Date().toISOString() };
        }
        case "START_SERVER":
          await runtime.servers.start(serverId, signal);
          break;
        case "STOP_SERVER":
          await runtime.servers.stop(serverId, signal);
          break;
        case "RESTART_SERVER":
          await runtime.servers.restart(serverId, signal);
          break;
        case "KILL_SERVER":
          await runtime.servers.kill(serverId, signal);
          break;
        case "DELETE_SERVER":
          throw new Error("DELETE_SERVER remains disabled until verified backup retention and safe cleanup are implemented.");
        case "CREATE_BACKUP": {
          const payload = createBackupJobPayloadSchema.parse(job.payload);
          const container = await runtime.servers.find(serverId);
          if (!container || !container.managed || container.serverId !== serverId) throw new Error("Owned server container was not found.");
          const result = await runtime.backups.create(serverId, container.id, payload.backupId, payload.maxBytes, signal);
          return { serverId, operation: type, backupId: payload.backupId, ...result, completedAt: new Date().toISOString() };
        }
        case "RESTORE_BACKUP": {
          const payload = restoreBackupJobPayloadSchema.parse(job.payload);
          const container = await runtime.servers.find(serverId);
          if (!container || !container.managed || container.serverId !== serverId) throw new Error("Owned server container was not found.");
          if (container.running) await runtime.servers.stop(serverId, signal);
          const result = await runtime.backups.restore(serverId, container.id, payload.backupId, payload.storagePath, payload.checksum, payload.maxBytes, signal);
          return { serverId, operation: type, backupId: payload.backupId, ...result, completedAt: new Date().toISOString() };
        }
        default: {
          const exhaustiveCheck: never = type;
          throw new Error(`Unsupported job type: ${String(exhaustiveCheck)}`);
        }
      }

      if (signal.aborted) throw new Error("Job was aborted.");
      return { serverId, operation: type, completedAt: new Date().toISOString() };
    },
  };
}

export function registerJobHandlers(manager: JobManager, runtime: DockerRuntime, defaultPidsLimit = 512): void {
  for (const type of SUPPORTED_JOB_TYPES) {
    manager.registerHandler(type, createHandler(runtime, type, defaultPidsLimit));
  }
}
