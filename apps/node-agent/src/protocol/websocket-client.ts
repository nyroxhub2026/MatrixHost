import WebSocket, { type RawData } from "ws";

import { loadAgentConfig } from "../config.js";

import {
  agentIncomingMessageSchema,
  type AgentIncomingMessage,
  type AgentOutgoingMessage,
} from "./message-schemas.js";

type AgentConfig = ReturnType<typeof loadAgentConfig>;

export interface WebSocketClientOptions {
  onMessage: (
    message: AgentIncomingMessage,
  ) => void | Promise<void>;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

export class AgentWebSocketClient {
  private socket: WebSocket | undefined;

  private reconnectTimer:
    | ReturnType<typeof setTimeout>
    | undefined;

  private reconnectDelay = 1_000;
  private stopped = true;
  private connecting = false;
  private generation = 0;
  private messageQueue: Promise<void> = Promise.resolve();

  private readonly config: AgentConfig;
  private readonly options: WebSocketClientOptions;

  constructor(
    config: AgentConfig,
    options: WebSocketClientOptions,
  ) {
    this.config = config;
    this.options = options;
  }

  start(): void {
    if (!this.stopped) {
      return;
    }

    this.stopped = false;
    this.connect();
  }

  private connect(): void {
    if (
      this.stopped ||
      this.connecting ||
      this.socket
    ) {
      return;
    }

    this.connecting = true;
    const generation = ++this.generation;

    try {
      const url = new URL(
        `nodes/${this.config.NODE_ID}/agent/ws`,
        this.config.API_BASE_URL.endsWith("/")
          ? this.config.API_BASE_URL
          : `${this.config.API_BASE_URL}/`,
      );

      if (
        url.protocol !== "http:" &&
        url.protocol !== "https:"
      ) {
        throw new Error("Unsupported API URL protocol.");
      }

      url.protocol =
        url.protocol === "https:" ? "wss:" : "ws:";

      const socket = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.config.AGENT_TOKEN}`,
        },
        handshakeTimeout: 10_000,
        maxPayload: 64 * 1024,
        perMessageDeflate: false,
      });

      this.socket = socket;

      socket.on("open", () => {
        if (
          this.stopped ||
          generation !== this.generation
        ) {
          socket.close(1000, "Connection superseded.");
          return;
        }

        this.connecting = false;
        this.reconnectDelay = 1_000;
        this.options.onConnected?.();
      });

      socket.on("message", (data: RawData) => {
        if (
          this.stopped ||
          generation !== this.generation
        ) {
          return;
        }

        this.messageQueue = this.messageQueue
          .then(() => this.handleMessage(data, socket))
          .catch((error) => {
            this.options.onError?.(
              error instanceof Error
                ? error
                : new Error("Message processing failed."),
            );
          });
      });

      socket.on("error", (error) => {
        this.options.onError?.(error);
      });

      socket.on("close", () => {
        if (generation !== this.generation) {
          return;
        }

        this.socket = undefined;
        this.connecting = false;

        if (this.stopped) {
          return;
        }

        this.options.onDisconnected?.();
        this.scheduleReconnect();
      });
    } catch (error) {
      this.connecting = false;

      this.options.onError?.(
        error instanceof Error
          ? error
          : new Error("WebSocket connection failed."),
      );

      this.scheduleReconnect();
    }
  }

  private async handleMessage(
    data: RawData,
    socket: WebSocket,
  ): Promise<void> {
    if (
      this.stopped ||
      socket !== this.socket
    ) {
      return;
    }

    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(data.toString());
    } catch {
      this.options.onError?.(
        new Error("API sent invalid JSON."),
      );

      socket.close(1008, "Invalid JSON.");
      return;
    }

    const parsed =
      agentIncomingMessageSchema.safeParse(parsedJson);

    if (!parsed.success) {
      this.options.onError?.(
        new Error("API sent an invalid protocol message."),
      );

      socket.close(
        1008,
        "Invalid protocol message.",
      );

      return;
    }

    try {
      await this.options.onMessage(parsed.data);
    } catch (error) {
      this.options.onError?.(
        error instanceof Error
          ? error
          : new Error("Message handler failed."),
      );
    }
  }

  send(message: AgentOutgoingMessage): boolean {
    const socket = this.socket;

    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    try {
      socket.send(
        JSON.stringify(message),
        (error) => {
          if (error) {
            this.options.onError?.(error);
          }
        },
      );

      return true;
    } catch (error) {
      this.options.onError?.(
        error instanceof Error
          ? error
          : new Error("WebSocket send failed."),
      );

      return false;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    const jitter = Math.floor(
      Math.random() * 500,
    );

    const delay = Math.min(
      this.reconnectDelay + jitter,
      60_000,
    );

    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      60_000,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  async stop(): Promise<void> {
    if (this.stopped) {
      return;
    }

    this.stopped = true;
    this.generation++;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    const socket = this.socket;
    this.socket = undefined;

    if (!socket) {
      this.connecting = false;
      return;
    }

    if (socket.readyState === WebSocket.CLOSED) {
      this.connecting = false;
      return;
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        socket.terminate();
        resolve();
      }, 3_000);

      socket.once("close", () => {
        clearTimeout(timeout);
        resolve();
      });

      socket.close(1000, "Agent shutting down.");
    });

    this.connecting = false;
  }
}
