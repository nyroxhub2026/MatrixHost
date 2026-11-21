import { loadAgentConfig } from "./config.js";
import { collectHardwareSnapshot } from "./resources/hardware.js";
import { AgentHttpClient } from "./protocol/http-client.js";

async function main(): Promise<void> {
  const config = loadAgentConfig();
  const client = new AgentHttpClient(config);

  let stopped = false;
  let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  let activeHeartbeat: Promise<void> | undefined;

  async function sendHeartbeat(): Promise<void> {
    if (stopped || activeHeartbeat) {
      return;
    }

    activeHeartbeat = (async () => {
      try {
        const hardware = await collectHardwareSnapshot();

        await client.sendHeartbeat(hardware);

        console.info(
          `[MatrixHost Agent] Heartbeat sent successfully. Node: ${config.NODE_ID}`,
        );
      } catch (error) {
        console.error(
          "[MatrixHost Agent] Heartbeat failed:",
          error instanceof Error ? error.message : "Unknown error",
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
      void sendHeartbeat().finally(scheduleHeartbeat);
    }, config.HEARTBEAT_INTERVAL_MS);
  }

  async function shutdown(signal: string): Promise<void> {
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

    if (activeHeartbeat) {
      await activeHeartbeat;
    }

    console.info("[MatrixHost Agent] Shutdown complete.");
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

    void shutdown("UNCAUGHT_EXCEPTION").finally(() => {
      process.exit(1);
    });
  });

  process.on("unhandledRejection", (reason) => {
    console.error(
      "[MatrixHost Agent] Unhandled rejection:",
      reason,
    );

    void shutdown("UNHANDLED_REJECTION").finally(() => {
      process.exit(1);
    });
  });

  console.info("[MatrixHost Agent] Starting...");
  console.info(`[MatrixHost Agent] Node ID: ${config.NODE_ID}`);
  console.info(`[MatrixHost Agent] Version: ${config.AGENT_VERSION}`);

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
