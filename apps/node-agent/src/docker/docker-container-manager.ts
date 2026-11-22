import { DockerClient } from "./docker-client.js";

import type {
  DockerCommandResult,
} from "./docker.types.js";

import type {
  DockerContainerOperation,
} from "./docker-client.js";

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
    return this.execute("remove", containerId);
  }

  private async execute(
    operation: DockerContainerOperation,
    containerId: string,
  ): Promise<DockerCommandResult> {
    try {
      await this.docker.containerCommand(
        operation,
        containerId,
      );

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
