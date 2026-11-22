import type { DockerRuntime } from "../docker/docker-runtime.js";

import { JobManager } from "./job-manager.js";

import type {
  AgentJob,
  AgentJobHandler,
  AgentJobType,
} from "./job.types.js";

const SUPPORTED_JOB_TYPES: AgentJobType[] = [
  "CREATE_SERVER",
  "START_SERVER",
  "STOP_SERVER",
  "RESTART_SERVER",
  "KILL_SERVER",
  "DELETE_SERVER",
];

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
            "CREATE_SERVER is not enabled yet. Startup configuration, trusted image validation and storage quota enforcement must be completed first.",
          );
        }

        case "START_SERVER": {
          await runtime.servers.start(serverId);
          break;
        }

        case "STOP_SERVER": {
          await runtime.servers.stop(serverId);
          break;
        }

        case "RESTART_SERVER": {
          await runtime.servers.restart(serverId);
          break;
        }

        case "KILL_SERVER": {
          await runtime.servers.kill(serverId);
          break;
        }

        case "DELETE_SERVER": {
          throw new Error(
            "DELETE_SERVER is not enabled yet. Backup and volume deletion safeguards must be completed first.",
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
