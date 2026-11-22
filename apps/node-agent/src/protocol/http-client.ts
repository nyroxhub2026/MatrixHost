import { z } from "zod";

import type { AgentConfig } from "../config.js";
import type { HardwareSnapshot } from "../resources/hardware.js";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

export interface AgentServerStatus {
  serverId: string;
  containerId: string;
  status:
    | "running"
    | "created"
    | "exited"
    | "restarting"
    | "dead"
    | "paused"
    | "removing"
    | "unknown";
  exitCode: number | null;
}

const heartbeatResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    node: z.object({
      id: z.string().uuid(),
      name: z.string(),
      status: z.string(),
      lastHeartbeatAt: z.iso.datetime(),
    }),
    message: z.string(),
  }),
});

export class AgentHttpClient {
  private readonly baseUrl: URL;

  constructor(
    private readonly config: AgentConfig,
  ) {
    this.baseUrl = new URL(
      config.API_BASE_URL.endsWith("/")
        ? config.API_BASE_URL
        : `${config.API_BASE_URL}/`,
    );

    if (
      this.baseUrl.protocol !== "http:" &&
      this.baseUrl.protocol !== "https:"
    ) {
      throw new Error(
        "Unsupported MatrixHost API URL protocol.",
      );
    }

    if (
      config.NODE_ENV === "production" &&
      this.baseUrl.protocol !== "https:"
    ) {
      throw new Error(
        "Production Agent requires HTTPS.",
      );
    }

    if (
      !config.NODE_ID ||
      !config.AGENT_TOKEN
    ) {
      throw new Error(
        "Node Agent credentials are missing.",
      );
    }
  }

  async sendHeartbeat(
    hardware: HardwareSnapshot,
    servers: AgentServerStatus[] = [],
  ): Promise<void> {
    const endpoint = new URL(
      `nodes/${encodeURIComponent(this.config.NODE_ID)}/heartbeat`,
      this.baseUrl,
    );

    const payload = {
      agentVersion: this.config.AGENT_VERSION,
      ...hardware,
      servers,
    };

    let response: Response;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.AGENT_TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: "error",
      });
    } catch {
      throw new Error(
        "Unable to reach MatrixHost API or request timed out.",
      );
    }

    if (!response.ok) {
      if (
        response.status === 401 ||
        response.status === 403
      ) {
        throw new Error(
          "Node Agent authentication failed. Check the credential.",
        );
      }

      if (response.status === 404) {
        throw new Error(
          "Node was not found by MatrixHost API.",
        );
      }

      if (response.status === 429) {
        throw new Error(
          "MatrixHost API rate limit reached.",
        );
      }

      throw new Error(
        `MatrixHost API returned HTTP ${response.status}.`,
      );
    }

    const contentType =
      response.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error(
        "MatrixHost API returned an unexpected content type.",
      );
    }

    const contentLength =
      response.headers.get("content-length");

    if (
      contentLength !== null &&
      (!/^\d+$/.test(contentLength) ||
        Number(contentLength) > MAX_RESPONSE_BYTES)
    ) {
      throw new Error(
        "MatrixHost API response is too large or has an invalid length.",
      );
    }

    if (!response.body) {
      throw new Error(
        "MatrixHost API returned an empty response body.",
      );
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        totalBytes += value.byteLength;

        if (totalBytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error(
            "MatrixHost API response is too large.",
          );
        }

        chunks.push(value);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "MatrixHost API response is too large."
      ) {
        throw error;
      }

      throw new Error(
        "Unable to read MatrixHost API response.",
      );
    } finally {
      reader.releaseLock();
    }

    let responseText: string;

    try {
      const combined = new Uint8Array(totalBytes);
      let offset = 0;

      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }

      responseText = new TextDecoder("utf-8", {
        fatal: true,
      }).decode(combined);
    } catch {
      throw new Error(
        "MatrixHost API returned invalid UTF-8.",
      );
    }

    let responseJson: unknown;

    try {
      responseJson = JSON.parse(responseText);
    } catch {
      throw new Error(
        "MatrixHost API returned invalid JSON.",
      );
    }

    const parsed = heartbeatResponseSchema.safeParse(
      responseJson,
    );

    if (
      !parsed.success ||
      parsed.data.data.node.id !== this.config.NODE_ID
    ) {
      throw new Error(
        "MatrixHost API did not confirm the heartbeat.",
      );
    }
  }
}
