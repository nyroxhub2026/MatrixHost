import type { AgentConfig } from "../config.js";
import type { HardwareSnapshot } from "../resources/hardware.js";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

interface ApiResponse {
  success: boolean;
  data?: {
    node?: {
      id: string;
      name: string;
      status: string;
      lastHeartbeatAt: string;
    };
    message?: string;
  };
}

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
  ): Promise<void> {
    const endpoint = new URL(
      `nodes/${encodeURIComponent(this.config.NODE_ID)}/heartbeat`,
      this.baseUrl,
    );

    const payload = {
      agentVersion: this.config.AGENT_VERSION,
      ...hardware,
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
      contentLength &&
      Number(contentLength) > MAX_RESPONSE_BYTES
    ) {
      throw new Error(
        "MatrixHost API response is too large.",
      );
    }

    let responseText: string;

    try {
      responseText = await response.text();
    } catch {
      throw new Error(
        "Unable to read MatrixHost API response.",
      );
    }

    if (
      Buffer.byteLength(responseText, "utf8") >
      MAX_RESPONSE_BYTES
    ) {
      throw new Error(
        "MatrixHost API response is too large.",
      );
    }

    let result: unknown;

    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error(
        "MatrixHost API returned invalid JSON.",
      );
    }

    if (
      typeof result !== "object" ||
      result === null ||
      !("success" in result) ||
      result.success !== true ||
      !("data" in result) ||
      typeof result.data !== "object" ||
      result.data === null ||
      !("node" in result.data) ||
      typeof result.data.node !== "object" ||
      result.data.node === null ||
      !("id" in result.data.node) ||
      result.data.node.id !== this.config.NODE_ID
    ) {
      throw new Error(
        "MatrixHost API did not confirm the heartbeat.",
      );
    }
  }
}
