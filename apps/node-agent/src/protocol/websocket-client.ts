import WebSocket from "ws";
import type { RawData } from "ws";

import type { AgentConfig } from "../config.js";

export interface AgentWebSocketMessage {
  type: string;
  [key: string]: unknown;
}

export interface WebSocketClientOptions {
  onMessage: (message: AgentWebSocketMessage) => void | Promise<void>;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

const MAX_RECONNECT_DELAY_MS = 60000;
const MAX_MESSAGE_SIZE = 1024 * 1024;

function toText(data: RawData): string {
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  return Buffer.from(data).toString("utf8");
}

export class AgentWebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectTimer:
    | ReturnType<typeof setTimeout>
    | undefined;

  private running = false;
  private reconnectAttempts = 0;

  constructor(
    private readonly config: AgentConfig,
    private readonly options: WebSocketClientOptions,
  ) {}

  private getWebSocketUrl(): URL {
    const base = new URL(this.config.API_BASE_URL);

    if (base.protocol === "https:") {
      base.protocol = "wss:";
    } else if (base.protocol === "http:") {
      base.protocol = "ws:";
    } else {
      throw new Error("Unsupported API URL protocol.");
    }

    base.pathname = [
      base.pathname.replace(/\/+$/, ""),
      "nodes",
      encodeURIComponent(this.config.NODE_ID),
      "agent",
      "ws",
    ].join("/");

    base.search = "";
    base.hash = "";

    return base;
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.connect();
  }

  private connect(): void {
    if (!this.running || this.socket) {
      return;
    }

    let socket: WebSocket;

    try {
      socket = new WebSocket(
        this.getWebSocketUrl(),
        {
          headers: {
            Authorization: `Bearer ${this.config.AGENT_TOKEN}`,
          },
          handshakeTimeout: 10000,
          maxPayload: MAX_MESSAGE_SIZE,
          perMessageDeflate: false,
        },
      );
    } catch (error) {
      this.reportError(error);
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;

    socket.on("open", () => {
      if (this.socket !== socket) {
        socket.close();
        return;
      }

      this.reconnectAttempts = 0;
      this.options.onConnected?.();
    });

    socket.on("message", (data) => {
      if (this.socket !== socket) {
        return;
      }

      try {
        const parsed: unknown = JSON.parse(toText(data));

        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed) ||
          typeof (parsed as Record<string, unknown>).type !== "string"
        ) {
          throw new Error("Invalid WebSocket message.");
        }

        const message = parsed as AgentWebSocketMessage;

        void Promise.resolve(
          this.options.onMessage(message),
        ).catch((error: unknown) => {
          this.reportError(error);
        });
      } catch (error) {
        this.reportError(error);
      }
    });

    socket.on("error", (error) => {
      this.reportError(error);
    });

    socket.on("close", () => {
      if (this.socket === socket) {
        this.socket = null;
      }

      this.options.onDisconnected?.();

      if (this.running) {
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer) {
      return;
    }

    const exponent = Math.min(
      this.reconnectAttempts,
      6,
    );

    const baseDelay = Math.min(
      this.config.RECONNECT_INTERVAL_MS * 2 ** exponent,
      MAX_RECONNECT_DELAY_MS,
    );

    const jitter = Math.floor(
      Math.random() * Math.max(1, baseDelay * 0.2),
    );

    const delay = baseDelay + jitter;

    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  private reportError(error: unknown): void {
    const safeError =
      error instanceof Error
        ? error
        : new Error("Unknown WebSocket error.");

    this.options.onError?.(safeError);
  }

  send(message: AgentWebSocketMessage): boolean {
    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      this.reportError(error);
      return false;
    }
  }

  isConnected(): boolean {
    return (
      this.socket?.readyState === WebSocket.OPEN
    );
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    const socket = this.socket;
    this.socket = null;

    if (!socket) {
      return;
    }

    await new Promise<void>((resolve) => {
      if (
        socket.readyState === WebSocket.CLOSED
      ) {
        resolve();
        return;
      }

      socket.once("close", () => resolve());
      socket.close(1000, "Agent shutting down");

      setTimeout(() => {
        if (socket.readyState !== WebSocket.CLOSED) {
          socket.terminate();
        }

        resolve();
      }, 3000);
    });
  }
}
