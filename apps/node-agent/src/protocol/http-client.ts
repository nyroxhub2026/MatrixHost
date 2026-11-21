import type { AgentConfig } from "../config.js";
import type { HardwareSnapshot } from "../resources/hardware.js";

const REQUEST_TIMEOUT_MS = 10000;

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
      config.NODE_ENV === "production" &&
      this.baseUrl.protocol !== "https:"
    ) {
      throw new Error(
        "Production Agent requires HTTPS.",
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
          "Authorization": `Bearer ${this.config.AGENT_TOKEN}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: "error",
      });
    } catch {
      throw new Error(
        "Unable to reach MatrixHost API.",
      );
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
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

    let result: ApiResponse;

    try {
      result = await response.json() as ApiResponse;
    } catch {
      throw new Error(
        "MatrixHost API returned an invalid response.",
      );
    }

    if (
      result.success !== true ||
      result.data?.node?.id !== this.config.NODE_ID
    ) {
      throw new Error(
        "MatrixHost API did not confirm the heartbeat.",
      );
    }
  }
}
