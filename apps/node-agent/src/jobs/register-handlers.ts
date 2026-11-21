import { JobManager } from "./job-manager.js";

import type {
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

const unavailableHandler: AgentJobHandler = {
  async execute(job, signal) {
    if (signal.aborted) {
      throw new Error("Job was aborted.");
    }

    throw new Error(
      `Job type ${job.type} is not implemented yet.`,
    );
  },
};

export function registerJobHandlers(
  manager: JobManager,
): void {
  for (const type of SUPPORTED_JOB_TYPES) {
    manager.registerHandler(
      type,
      unavailableHandler,
    );
  }
}
