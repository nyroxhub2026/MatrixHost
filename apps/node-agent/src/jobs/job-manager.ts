import { agentJobSchema } from "./job.schemas.js";

import type { ValidatedAgentJob } from "./job.schemas.js";

import type {
  AgentJobHandler,
  AgentJobResult,
} from "./job.types.js";

const MAX_CONCURRENT_JOBS = 5;
const MAX_COMPLETED_JOBS = 1000;

type JobStatus = "RUNNING" | "COMPLETED" | "FAILED";

interface JobRecord {
  status: JobStatus;
  completedAt?: number;
}

export interface JobSubmission {
  accepted: boolean;
  jobId: string;
  error?: {
    code: string;
    message: string;
  };
  result?: Promise<AgentJobResult>;
}

export class JobManager {
  private readonly handlers = new Map<
    ValidatedAgentJob["type"],
    AgentJobHandler
  >();

  private readonly jobs = new Map<string, JobRecord>();

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
      throw new Error("Job Manager is stopped.");
    }

    if (this.handlers.has(type)) {
      throw new Error(
        `A handler is already registered for ${type}.`,
      );
    }

    this.handlers.set(type, handler);
  }

  submit(input: unknown): JobSubmission {
    if (this.stopped) {
      return this.reject(
        "unknown",
        "MANAGER_STOPPED",
        "Job Manager is stopped.",
      );
    }

    const parsed = agentJobSchema.safeParse(input);

    if (!parsed.success) {
      return this.reject(
        "unknown",
        "INVALID_JOB",
        "Job payload validation failed.",
      );
    }

    const job = parsed.data;

    if (this.jobs.has(job.id)) {
      const existing = this.jobs.get(job.id)!;

      return this.reject(
        job.id,
        "DUPLICATE_JOB",
        `Job already exists with status ${existing.status}.`,
      );
    }

    const handler = this.handlers.get(job.type);

    if (!handler) {
      return this.reject(
        job.id,
        "UNSUPPORTED_JOB",
        `No handler is registered for ${job.type}.`,
      );
    }

    if (this.activeJobs.size >= MAX_CONCURRENT_JOBS) {
      return this.reject(
        job.id,
        "JOB_CAPACITY_REACHED",
        "The Agent has reached its job capacity.",
      );
    }

    const controller = new AbortController();

    // Reserve the job before acknowledging it.
    this.jobs.set(job.id, {
      status: "RUNNING",
    });

    this.activeJobs.set(job.id, controller);

    const result = this.runJob(
      job,
      handler,
      controller,
    );

    return {
      accepted: true,
      jobId: job.id,
      result,
    };
  }

  async execute(input: unknown): Promise<AgentJobResult> {
    const submission = this.submit(input);

    if (!submission.accepted || !submission.result) {
      return {
        jobId: submission.jobId,
        success: false,
        error: submission.error ?? {
          code: "JOB_REJECTED",
          message: "The job was not accepted.",
        },
      };
    }

    return submission.result;
  }

  cancel(jobId: string): boolean {
    const controller = this.activeJobs.get(jobId);

    if (!controller) {
      return false;
    }

    controller.abort();
    return true;
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
        (jobId) => this.waitForJob(jobId),
      ),
    );
  }

  private async runJob(
    job: ValidatedAgentJob,
    handler: AgentJobHandler,
    controller: AbortController,
  ): Promise<AgentJobResult> {
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
          message:
            error instanceof Error
              ? error.message.slice(0, 500)
              : "Unknown job execution error.",
        },
      };
    } finally {
      this.activeJobs.delete(job.id);
      this.cleanupCompletedJobs();
    }
  }

  private reject(
    jobId: string,
    code: string,
    message: string,
  ): JobSubmission {
    return {
      accepted: false,
      jobId,
      error: {
        code,
        message,
      },
    };
  }

  private async waitForJob(jobId: string): Promise<void> {
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
