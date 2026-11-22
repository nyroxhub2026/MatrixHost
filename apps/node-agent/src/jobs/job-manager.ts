import { agentJobSchema } from "./job.schemas.js";

import type { ValidatedAgentJob } from "./job.schemas.js";

import type {
  AgentJobHandler,
  AgentJobResult,
} from "./job.types.js";

const MAX_CONCURRENT_JOBS = 5;
const MAX_COMPLETED_JOBS = 1000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

type JobStatus = "RUNNING" | "COMPLETED" | "FAILED";

interface JobRecord {
  status: JobStatus;
  completedAt?: number;
  result?: AgentJobResult;
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

  private readonly runningPromises = new Map<
    string,
    Promise<AgentJobResult>
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
    const existing = this.jobs.get(job.id);

    if (existing) {
      const existingPromise = this.runningPromises.get(job.id);

      if (existingPromise) {
        return {
          accepted: true,
          jobId: job.id,
          result: existingPromise,
        };
      }

      if (existing.result) {
        return {
          accepted: true,
          jobId: job.id,
          result: Promise.resolve(existing.result),
        };
      }

      return this.reject(
        job.id,
        "DUPLICATE_JOB",
        "Job was already processed.",
      );
    }

    const handler = this.handlers.get(job.type);

    if (!handler) {
      return this.reject(
        job.id,
        "UNSUPPORTED_JOB",
        "No handler is registered for this job type.",
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

    this.jobs.set(job.id, {
      status: "RUNNING",
    });

    this.activeJobs.set(job.id, controller);

    const result = this.runJob(
      job,
      handler,
      controller,
    );

    this.runningPromises.set(job.id, result);

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

    if (!controller || controller.signal.aborted) {
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

    const running = Array.from(
      this.runningPromises.values(),
    );

    if (running.length === 0) {
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        Promise.allSettled(running),
        new Promise<void>((resolve) => {
          timeout = setTimeout(
            resolve,
            SHUTDOWN_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
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

      const jobResult: AgentJobResult = {
        jobId: job.id,
        success: true,
        result,
      };

      this.jobs.set(job.id, {
        status: "COMPLETED",
        completedAt: Date.now(),
        result: jobResult,
      });

      return jobResult;
    } catch {
      const jobResult: AgentJobResult = {
        jobId: job.id,
        success: false,
        error: {
          code: controller.signal.aborted
            ? "JOB_ABORTED"
            : "JOB_EXECUTION_FAILED",
          message: controller.signal.aborted
            ? "Job execution was cancelled."
            : "Job execution failed.",
        },
      };

      this.jobs.set(job.id, {
        status: "FAILED",
        completedAt: Date.now(),
        result: jobResult,
      });

      return jobResult;
    } finally {
      this.activeJobs.delete(job.id);
      this.runningPromises.delete(job.id);
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

  private cleanupCompletedJobs(): void {
    if (this.jobs.size <= MAX_COMPLETED_JOBS) {
      return;
    }

    const completed = Array.from(this.jobs.entries())
      .filter(([, record]) => record.status !== "RUNNING")
      .sort(
        (a, b) =>
          (a[1].completedAt ?? 0) -
          (b[1].completedAt ?? 0),
      );

    while (
      this.jobs.size > MAX_COMPLETED_JOBS &&
      completed.length > 0
    ) {
      const oldest = completed.shift();

      if (oldest) {
        this.jobs.delete(oldest[0]);
      }
    }
  }
}
