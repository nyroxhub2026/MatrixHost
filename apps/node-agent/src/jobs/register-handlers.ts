import type { DockerRuntime } from "../docker/docker-runtime.js";

import { JobManager } from "./job-manager.js";

import type {
  AgentJob,
  AgentJobHandler,
  AgentJobType,
} from "./job.types.js";

const SUPPORTED_JOB_TYPES = [
  "CREATE_SERVER",
  "START_SERVER",
  "STOP_SERVER",
  "RESTART_SERVER",
  "KILL_SERVER",
  "DELETE_SERVER",
] as const satisfies readonly AgentJobType[];

function getServerId(job: AgentJob): string {
  if (
    typeof job.serverId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      job.serverId,
    )
  ) {
    throw new Error("Invalid server ID.");
  }

  return job.serverId;
}

function createHandler(
  runtime: DockerRuntime,
  type: AgentJobType,
): AgentJobHandler {
  return {
    async execute(job, signal) {
      if (signal.aborted) {
        throw new Error("Job was aborted.");
      }

      const serverId = getServerId(job);

      switch (type) {
        case "CREATE_SERVER": {
          throw new Error(
            "CREATE_SERVER is disabled until startup validation, trusted image restrictions, network isolation and storage quota enforcement are implemented.",
          );
        }

        case "START_SERVER": {
          await runtime.servers.start(serverId, signal);
          break;
        }

        case "STOP_SERVER": {
          await runtime.servers.stop(serverId, signal);
          break;
        }

        case "RESTART_SERVER": {
          await runtime.servers.restart(serverId, signal);
          break;
        }

        case "KILL_SERVER": {
          await runtime.servers.kill(serverId, signal);
          break;
        }

        case "DELETE_SERVER": {
          throw new Error(
            "DELETE_SERVER is disabled until backup, ownership and volume deletion safeguards are implemented.",
          );
        }

        default: {
          const exhaustiveCheck: never = type;

          throw new Error(
            `Unsupported job type: ${String(exhaustiveCheck)}`,
          );
        }
      }

      if (signal.aborted) {
        throw new Error("Job was aborted.");
      }

      return {
        serverId,
        operation: type,
        completedAt: new Date().toISOString(),
      };
    },
  };
}

export function registerJobHandlers(
  manager: JobManager,
  runtime: DockerRuntime,
): void {
  for (const type of SUPPORTED_JOB_TYPES) {
    manager.registerHandler(
      type,
      createHandler(runtime, type),
    );
  }
}
