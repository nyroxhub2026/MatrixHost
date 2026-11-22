import { DockerClient } from "./docker-client.js";

import type {
  DockerCommandResult,
} from "./docker.types.js";

const COMMAND_TIMEOUT_MS = 30_000;

const CONTAINER_ID_PATTERN =
  /^[a-f0-9]{12,64}$/i;

export class DockerContainerManager {
  constructor(
    private readonly docker: DockerClient,
  ) {}

  async start(
    containerId: string,
  ): Promise<DockerCommandResult> {
    return this.execute("start", containerId);
  }

  async stop(
    containerId: string,
  ): Promise<DockerCommandResult> {
    return this.execute("stop", containerId);
  }

  async restart(
    containerId: string,
  ): Promise<DockerCommandResult> {
    return this.execute("restart", containerId);
  }

  async kill(
    containerId: string,
  ): Promise<DockerCommandResult> {
    return this.execute("kill", containerId);
  }

  async remove(
    containerId: string,
  ): Promise<DockerCommandResult> {
    return this.execute("rm", containerId, ["--force"]);
  }

  private async execute(
    operation: "start" | "stop" | "restart" | "kill" | "rm",
    containerId: string,
    extraArgs: string[] = [],
  ): Promise<DockerCommandResult> {
    if (!CONTAINER_ID_PATTERN.test(containerId)) {
      return {
        success: false,
        message: "Invalid Docker container ID.",
      };
    }

    try {
      const { execFile } = await import("node:child_process");

      await new Promise<void>((resolve, reject) => {
        execFile(
          "docker",
          [operation, ...extraArgs, containerId],
          {
            timeout: COMMAND_TIMEOUT_MS,
            maxBuffer: 1024 * 1024,
            windowsHide: true,
            encoding: "utf8",
            shell: false,
          },
          (error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          },
        );
      });

      return {
        success: true,
        message: `Container ${operation} completed.`,
      };
    } catch {
      return {
        success: false,
        message: `Container ${operation} failed.`,
      };
    }
  }
}
