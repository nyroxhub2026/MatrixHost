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
    serverId: string,
  ): Promise<DockerCommandResult> {
    return this.execute("start", containerId, serverId);
  }

  async stop(
    containerId: string,
    serverId: string,
  ): Promise<DockerCommandResult> {
    return this.execute("stop", containerId, serverId);
  }

  async restart(
    containerId: string,
    serverId: string,
  ): Promise<DockerCommandResult> {
    return this.execute("restart", containerId, serverId);
  }

  async kill(
    containerId: string,
    serverId: string,
  ): Promise<DockerCommandResult> {
    return this.execute("kill", containerId, serverId);
  }

  async remove(
    containerId: string,
    serverId: string,
  ): Promise<DockerCommandResult> {
    return this.execute("remove", containerId, serverId);
  }

  private async execute(
    operation: DockerContainerOperation,
    containerId: string,
    serverId: string,
  ): Promise<DockerCommandResult> {
    try {
      await this.docker.containerCommand(
        operation,
        containerId,
        serverId,
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
