import type {
  AgentWebSocketClient,
  AgentWebSocketMessage,
} from "../protocol/index.js";

import type {
  JobManager,
} from "./job-manager.js";

export class JobWebSocketBridge {
  constructor(
    private readonly manager: JobManager,
    private readonly socket: AgentWebSocketClient,
  ) {}

  async handleMessage(
    message: AgentWebSocketMessage,
  ): Promise<void> {
    if (message.type !== "job") {
      return;
    }

    const job = message.job;

    const accepted = this.socket.send({
      type: "job_ack",
      jobId: job.id,
      accepted: true,
    });

    if (!accepted) {
      return;
    }

    const result = await this.manager.execute(job);

    this.socket.send({
      type: "job_result",
      jobId: result.jobId,
      success: result.success,
      ...(result.result !== undefined
        ? { result: result.result }
        : {}),
      ...(result.error !== undefined
        ? { error: result.error }
        : {}),
    });
  }
}
