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

    const submission = this.manager.submit(message.job);

    const ackSent = this.socket.send({
      type: "job_ack",
      jobId: submission.jobId,
      accepted: submission.accepted,
    });

    if (!ackSent) {
      if (submission.accepted) {
        this.manager.cancel(submission.jobId);
      }

      return;
    }

    if (!submission.accepted || !submission.result) {
      return;
    }

    const result = await submission.result;

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
