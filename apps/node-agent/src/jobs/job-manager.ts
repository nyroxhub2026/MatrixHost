import {
  agentJobSchema,
} from "./job.schemas.js";

import type {
  ValidatedAgentJob,
} from "./job.schemas.js";

import type {
  AgentJobHandler,
  AgentJobResult,
} from "./job.types.js";

const MAX_CONCURRENT_JOBS = 5;
const MAX_COMPLETED_JOBS = 1000;

type JobStatus =
  | "RUNNING"
  | "COMPLETED"
  | "FAILED";

interface JobRecord {
  status: JobStatus;
  completedAt?: number;
}

export class JobManager {
  private readonly handlers = new Map<
    ValidatedAgentJob["type"],
    AgentJobHandler
  >();

  private readonly jobs = new Map<
    string,
    JobRecord
  >();

  private readonly activeJobs = new Map<
    string,
    AbortController
  >();

  private stopped = false;

  registerHandler(
    type: ValidatedAgentJob["type"],
    handler: AgentJobHandler,
  ): void {
    if (this.stopped) {
      throw new Error(
        "Job Manager is stopped.",
      );
    }

    if (this.handlers.has(type)) {
      throw new Error(
        `A handler is already registered for ${type}.`,
      );
    }

    this.handlers.set(type, handler);
  }

  async execute(
    input: unknown,
  ): Promise<AgentJobResult> {
    if (this.stopped) {
      return {
        jobId: "unknown",
        success: false,
        error: {
          code: "MANAGER_STOPPED",
          message: "Job Manager is stopped.",
        },
      };
    }

    const parsed = agentJobSchema.safeParse(input);

    if (!parsed.success) {
      return {
        jobId: "unknown",
        success: false,
        error: {
          code: "INVALID_JOB",
          message: "Job payload validation failed.",
        },
      };
    }

    const job = parsed.data;

    const existing = this.jobs.get(job.id);

    if (existing) {
      return {
        jobId: job.id,
        success: false,
        error: {
          code: "DUPLICATE_JOB",
          message: `Job already exists with status ${existing.status}.`,
        },
      };
    }

    const handler = this.handlers.get(job.type);

    if (!handler) {
      return {
        jobId: job.id,
        success: false,
        error: {
          code: "UNSUPPORTED_JOB",
          message: `No handler is registered for ${job.type}.`,
        },
      };
    }

    if (
      this.activeJobs.size >= MAX_CONCURRENT_JOBS
    ) {
      return {
        jobId: job.id,
        success: false,
        error: {
          code: "JOB_CAPACITY_REACHED",
          message: "The Agent has reached its job capacity.",
        },
      };
    }

    const controller = new AbortController();

    this.jobs.set(job.id, {
      status: "RUNNING",
    });

    this.activeJobs.set(
      job.id,
      controller,
    );

    try {
      const result = await handler.execute(
        job,
        controller.signal,
      );

      if (controller.signal.aborted) {
        throw new Error("Job was aborted.");
      }

      this.jobs.set(job.id, {
        status: "COMPLETED",
        completedAt: Date.now(),
      });

      return {
        jobId: job.id,
        success: true,
        result,
      };
    } catch (error) {
      this.jobs.set(job.id, {
        status: "FAILED",
        completedAt: Date.now(),
      });

      return {
        jobId: job.id,
        success: false,
        error: {
          code: controller.signal.aborted
            ? "JOB_ABORTED"
            : "JOB_EXECUTION_FAILED",
          message: error instanceof Error
            ? error.message.slice(0, 500)
            : "Unknown job execution error.",
        },
      };
    } finally {
      this.activeJobs.delete(job.id);
      this.cleanupCompletedJobs();
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) {
      return;
    }

    this.stopped = true;

    for (const controller of this.activeJobs.values()) {
      controller.abort();
    }

    await Promise.allSettled(
      Array.from(this.activeJobs.keys()).map(
        (jobId) =>
          this.waitForJob(jobId),
      ),
    );
  }

  private async waitForJob(
    jobId: string,
  ): Promise<void> {
    while (this.activeJobs.has(jobId)) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });
    }
  }

  private cleanupCompletedJobs(): void {
    if (this.jobs.size <= MAX_COMPLETED_JOBS) {
      return;
    }

    for (const [jobId, record] of this.jobs) {
      if (record.status === "RUNNING") {
        continue;
      }

      this.jobs.delete(jobId);

      if (this.jobs.size <= MAX_COMPLETED_JOBS) {
        break;
      }
    }
  }
}
