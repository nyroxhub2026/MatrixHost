import { loadAgentConfig } from "./config.js";
import { collectHardwareSnapshot } from "./resources/hardware.js";
import { AgentHttpClient } from "./protocol/http-client.js";

const config = loadAgentConfig();
const client = new AgentHttpClient(config);

let stopping = false;
let heartbeatRunning = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function log(
  level: "INFO" | "WARN" | "ERROR",
  message: string,
): void {
  console.log(
    `[${new Date().toISOString()}] [${level}] ${message}`,
  );
}

async function heartbeat(): Promise<void> {
  if (stopping || heartbeatRunning) {
    return;
  }

  heartbeatRunning = true;

  try {
    const hardware = await collectHardwareSnapshot();

    await client.sendHeartbeat({
      ...hardware,
      agentVersion: config.AGENT_VERSION,
    });

    log("INFO", "Heartbeat successfully delivered.");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown heartbeat error.";

    log("ERROR", message);
  } finally {
    heartbeatRunning = false;
  }
}

function scheduleHeartbeat(): void {
  if (stopping) {
    return;
  }

  timer = setTimeout(async () => {
    await heartbeat();
    scheduleHeartbeat();
  }, config.HEARTBEAT_INTERVAL_MS);
}

async function shutdown(
  signal: string,
): Promise<void> {
  if (stopping) {
    return;
  }

  stopping = true;

  if (timer) {
    clearTimeout(timer);
  }

  log("INFO", `Received ${signal}. Stopping Node Agent.`);

  // Wait for an active heartbeat to finish.
  while (heartbeatRunning) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  log("INFO", "Node Agent stopped.");
}

async function start(): Promise<void> {
  log("INFO", `Starting MatrixHost Node Agent ${config.AGENT_VERSION}`);
  log("INFO", `Node ID: ${config.NODE_ID}`);

  await heartbeat();

  if (!stopping) {
    scheduleHeartbeat();
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("uncaughtException", (error) => {
  log("ERROR", `Uncaught exception: ${error.message}`);
  process.exitCode = 1;
  void shutdown("uncaughtException");
});

process.once("unhandledRejection", (reason) => {
  const message =
    reason instanceof Error
      ? reason.message
      : "Unknown rejection";

  log("ERROR", `Unhandled rejection: ${message}`);
  process.exitCode = 1;
  void shutdown("unhandledRejection");
});

void start().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown startup error";

  log("ERROR", `Agent startup failed: ${message}`);
  process.exitCode = 1;
  void shutdown("startup failure");
});
