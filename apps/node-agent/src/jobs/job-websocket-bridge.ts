import type { AgentWebSocketClient } from "../protocol/websocket-client.js";
import type { AgentIncomingMessage } from "../protocol/message-schemas.js";

import type { JobManager } from "./job-manager.js";
import type { AgentJob } from "./job.types.js";

export class JobWebSocketBridge {
  constructor(
    private readonly manager: JobManager,
    private readonly client: AgentWebSocketClient,
  ) {}

  async handleMessage(
    message: Extract<AgentIncomingMessage, { type: "job" }>,
  ): Promise<void> {
    const submission = this.manager.submit(
      message.job as AgentJob,
    );

    const acknowledged = this.client.send({
      type: "job_ack",
      jobId: message.job.id,
      accepted: submission.accepted,
    });

    if (!acknowledged) {
      if (submission.accepted) {
        this.manager.cancel(message.job.id);
      }

      return;
    }

    if (!submission.accepted || !submission.result) {
      return;
    }

    const result = await submission.result;

    if (!this.client.send({
      type: "job_result",
      jobId: result.jobId,
      success: result.success,
      ...(result.result !== undefined
        ? { result: result.result }
        : {}),
      ...(result.error !== undefined
        ? { error: result.error }
        : {}),
    })) {
      console.error(
        "[MatrixHost Agent] Could not send job result:",
        result.jobId,
      );
    }
  }
}
