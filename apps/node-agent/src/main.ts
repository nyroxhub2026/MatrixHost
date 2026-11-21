import { loadAgentConfig } from "./config.js";
import { collectHardwareSnapshot } from "./resources/hardware.js";

import {
  AgentHttpClient,
  AgentWebSocketClient,
} from "./protocol/index.js";

import type {
  AgentWebSocketMessage,
} from "./protocol/index.js";

import {
  JobManager,
  JobWebSocketBridge,
  registerJobHandlers,
} from "./jobs/index.js";

async function main(): Promise<void> {
  const config = loadAgentConfig();
  const httpClient = new AgentHttpClient(config);

  const jobManager = new JobManager();
  registerJobHandlers(jobManager);

  let stopped = false;

  let heartbeatTimer:
    | ReturnType<typeof setTimeout>
    | undefined;

  let activeHeartbeat: Promise<void> | undefined;

  let jobBridge: JobWebSocketBridge | undefined;

  const webSocketClient = new AgentWebSocketClient(
    config,
    {
      onConnected: () => {
        console.info(
          "[MatrixHost Agent] WebSocket connected.",
        );
      },

      onDisconnected: () => {
        console.warn(
          "[MatrixHost Agent] WebSocket disconnected.",
        );
      },

      onError: (error) => {
        console.error(
          "[MatrixHost Agent] WebSocket error:",
          error.message,
        );
      },

      onMessage: async (
        message: AgentWebSocketMessage,
      ) => {
        await handleWebSocketMessage(message);
      },
    },
  );

  jobBridge = new JobWebSocketBridge(
    jobManager,
    webSocketClient,
  );

  async function handleWebSocketMessage(
    message: AgentWebSocketMessage,
  ): Promise<void> {
    switch (message.type) {
      case "connected": {
        if (message.nodeId !== config.NODE_ID) {
          throw new Error(
            "WebSocket connected message has an unexpected node ID.",
          );
        }

        if (message.protocolVersion !== 1) {
          throw new Error(
            "Unsupported WebSocket protocol version.",
          );
        }

        console.info(
          "[MatrixHost Agent] API handshake completed.",
        );

        break;
      }

      case "ping": {
        webSocketClient.send({
          type: "pong",
          timestamp: message.timestamp,
        });

        break;
      }

      case "pong": {
        console.debug(
          "[MatrixHost Agent] Received WebSocket pong.",
        );

        break;
      }

      case "job": {
        console.info(
          "[MatrixHost Agent] Received job.",
          {
            jobId: message.job.id,
            jobType: message.job.type,
          },
        );

        await jobBridge?.handleMessage(message);

        break;
      }

      case "job_ack": {
        console.info(
          "[MatrixHost Agent] Job acknowledgement received.",
          {
            jobId: message.jobId,
            accepted: message.accepted,
          },
        );

        break;
      }

      case "job_result": {
        console.info(
          "[MatrixHost Agent] Job result received.",
          {
            jobId: message.jobId,
            success: message.success,
          },
        );

        break;
      }

      default: {
        const exhaustiveCheck: never = message;

        throw new Error(
          `Unsupported message: ${String(exhaustiveCheck)}`,
        );
      }
    }
  }

  async function sendHeartbeat(): Promise<void> {
    if (stopped || activeHeartbeat) {
      return;
    }

    activeHeartbeat = (async () => {
      try {
        const hardware =
          await collectHardwareSnapshot();

        await httpClient.sendHeartbeat(hardware);

        console.info(
          "[MatrixHost Agent] Heartbeat sent successfully.",
        );
      } catch (error) {
        console.error(
          "[MatrixHost Agent] Heartbeat failed:",
          error instanceof Error
            ? error.message
            : "Unknown error.",
        );
      } finally {
        activeHeartbeat = undefined;
      }
    })();

    await activeHeartbeat;
  }

  function scheduleHeartbeat(): void {
    if (stopped) {
      return;
    }

    heartbeatTimer = setTimeout(() => {
      void sendHeartbeat().finally(
        scheduleHeartbeat,
      );
    }, config.HEARTBEAT_INTERVAL_MS);
  }

  async function shutdown(
    signal: string,
  ): Promise<void> {
    if (stopped) {
      return;
    }

    stopped = true;

    console.info(
      `[MatrixHost Agent] Received ${signal}. Shutting down...`,
    );

    if (heartbeatTimer) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = undefined;
    }

    await webSocketClient.stop();

    await jobManager.stop();

    if (activeHeartbeat) {
      await activeHeartbeat;
    }

    console.info(
      "[MatrixHost Agent] Shutdown complete.",
    );
  }

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.on("uncaughtException", (error) => {
    console.error(
      "[MatrixHost Agent] Uncaught exception:",
      error,
    );

    void shutdown("UNCAUGHT_EXCEPTION").finally(
      () => process.exit(1),
    );
  });

  process.on("unhandledRejection", (reason) => {
    console.error(
      "[MatrixHost Agent] Unhandled rejection:",
      reason,
    );

    void shutdown("UNHANDLED_REJECTION").finally(
      () => process.exit(1),
    );
  });

  console.info("[MatrixHost Agent] Starting...");

  console.info(
    `[MatrixHost Agent] Node ID: ${config.NODE_ID}`,
  );

  console.info(
    `[MatrixHost Agent] Version: ${config.AGENT_VERSION}`,
  );

  webSocketClient.start();

  await sendHeartbeat();

  scheduleHeartbeat();
}

void main().catch((error) => {
  console.error(
    "[MatrixHost Agent] Fatal startup error:",
    error,
  );

  process.exit(1);
});
