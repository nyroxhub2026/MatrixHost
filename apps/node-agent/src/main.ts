import { loadAgentConfig } from "./config.js";
import { collectHardwareSnapshot } from "./resources/hardware.js";

import {
  AgentHttpClient,
  AgentWebSocketClient,
} from "./protocol/index.js";

import type {
  AgentIncomingMessage,
} from "./protocol/message-schemas.js";

import {
  JobManager,
  JobWebSocketBridge,
} from "./jobs/index.js";

import {
  initializeDocker,
} from "./docker/index.js";

import {
  registerJobHandlers,
} from "./jobs/register-handlers.js";

async function main(): Promise<void> {
  const config = loadAgentConfig();

  console.info(
    "[MatrixHost Agent] Initializing Docker runtime...",
  );

  const docker = await initializeDocker();

  if (docker.initialHealth.healthy) {
    console.info(
      "[MatrixHost Agent] Docker is available:",
      docker.initialHealth.dockerVersion,
    );
  } else {
    console.warn(
      "[MatrixHost Agent] Docker is unavailable.",
    );
  }

  const httpClient = new AgentHttpClient(config);
  const jobManager = new JobManager();

  registerJobHandlers(
    jobManager,
    docker.runtime,
    docker.config.DOCKER_DEFAULT_PIDS_LIMIT,
  );

  let stopped = false;

  let heartbeatTimer:
    | ReturnType<typeof setTimeout>
    | undefined;

  let activeHeartbeat: Promise<void> | undefined;

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

      onMessage: async (message) => {
        await handleWebSocketMessage(message);
      },
    },
  );

  const jobBridge = new JobWebSocketBridge(
    jobManager,
    webSocketClient,
  );

  async function handleWebSocketMessage(
    message: AgentIncomingMessage,
  ): Promise<void> {
    switch (message.type) {
      case "connected": {
        if (
          message.nodeId !== config.NODE_ID ||
          message.protocolVersion !== 1
        ) {
          throw new Error(
            "API WebSocket identity or protocol mismatch.",
          );
        }

        console.info(
          "[MatrixHost Agent] Authenticated with MatrixHost API.",
        );

        return;
      }

      case "ping": {
        webSocketClient.send({
          type: "pong",
          timestamp: message.timestamp,
        });

        return;
      }

      case "pong": {
        console.debug(
          "[MatrixHost Agent] Pong received.",
        );

        return;
      }

      case "job": {
        console.info(
          "[MatrixHost Agent] Job received:",
          message.job.id,
          message.job.type,
        );

        await jobBridge.handleMessage(message);

        return;
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
    if (stopped) {
      return;
    }

    const hardware = await collectHardwareSnapshot();

    await httpClient.sendHeartbeat(hardware);

    console.info(
      "[MatrixHost Agent] Heartbeat sent.",
    );
  }

  function scheduleHeartbeat(): void {
    if (stopped) {
      return;
    }

    heartbeatTimer = setTimeout(() => {
      activeHeartbeat = sendHeartbeat()
        .catch((error) => {
          console.error(
            "[MatrixHost Agent] Heartbeat failed:",
            error instanceof Error
              ? error.message
              : "Unknown error.",
          );
        })
        .finally(() => {
          activeHeartbeat = undefined;
          scheduleHeartbeat();
        });
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
      `[MatrixHost Agent] Shutting down (${signal}).`,
    );

    if (heartbeatTimer) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = undefined;
    }

    const shutdownTasks = await Promise.allSettled([
      webSocketClient.stop(),
      jobManager.stop(),
      activeHeartbeat ?? Promise.resolve(),
    ]);

    for (const task of shutdownTasks) {
      if (task.status === "rejected") {
        console.error(
          "[MatrixHost Agent] Shutdown task failed:",
          task.reason instanceof Error
            ? task.reason.message
            : "Unknown shutdown error.",
        );
      }
    }

    try {
      await docker.runtime.shutdown();
    } catch (error) {
      console.error(
        "[MatrixHost Agent] Docker runtime shutdown failed:",
        error instanceof Error
          ? error.message
          : "Unknown shutdown error.",
      );
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

    process.exitCode = 1;
    void shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    console.error(
      "[MatrixHost Agent] Unhandled rejection:",
      reason,
    );

    process.exitCode = 1;
    void shutdown("unhandledRejection");
  });

  webSocketClient.start();

  try {
    await sendHeartbeat();
  } catch (error) {
    console.error(
      "[MatrixHost Agent] Initial heartbeat failed:",
      error instanceof Error
        ? error.message
        : "Unknown error.",
    );
  }

  scheduleHeartbeat();

  console.info(
    "[MatrixHost Agent] Started.",
  );
}

void main().catch((error) => {
  console.error(
    "[MatrixHost Agent] Fatal startup error:",
    error,
  );

  process.exitCode = 1;
});
