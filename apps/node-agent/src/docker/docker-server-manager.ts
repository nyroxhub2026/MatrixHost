import { DockerClient } from "./docker-client.js";
import { DockerVolumeManager } from "./docker-volume-manager.js";
import { DockerContainerDiscovery } from "./docker-container-discovery.js";
import { validateDockerCreateOptions } from "./docker-validation.js";

import type { DockerCreateOptions } from "./docker.types.js";

export class DockerServerManager {
  constructor(
    private readonly docker: DockerClient,
    private readonly volumes: DockerVolumeManager,
    private readonly discovery: DockerContainerDiscovery,
  ) {}

  async create(
    options: DockerCreateOptions,
  ): Promise<{
    serverId: string;
    containerId: string;
    volumeName: string;
  }> {
    validateDockerCreateOptions(options);

    const existing = await this.discovery.findByServerId(
      options.serverId,
    );

    if (existing) {
      throw new Error(
        "A Docker container already exists for this server.",
      );
    }

    const existingVolume = await this.volumes.find(
      options.volumeName,
    );

    if (existingVolume) {
      throw new Error(
        "A Docker volume already exists with this name.",
      );
    }

    await this.volumes.create(
      options.volumeName,
      options.serverId,
    );

    try {
      const containerId = await this.docker.createContainer({
        serverId: options.serverId,
        image: options.image,
        name: `matrixhost-${options.serverId}`,
        environment: options.environment,
        memoryBytes: options.limits.memoryBytes,
        memorySwapBytes: options.limits.memorySwapBytes,
        cpuPercent: options.limits.cpuPercent,
        pidsLimit: options.limits.pidsLimit,
        volumeName: options.volumeName,
      });

      return {
        serverId: options.serverId,
        containerId,
        volumeName: options.volumeName,
      };
    } catch (creationError) {
      try {
        await this.volumes.remove(
          options.volumeName,
          options.serverId,
        );
      } catch {
        throw new Error(
          "Container creation failed and volume cleanup also failed. Manual inspection is required.",
          { cause: creationError },
        );
      }

      throw creationError;
    }
  }

  async find(serverId: string) {
    return this.discovery.findByServerId(serverId);
  }

  async start(serverId: string): Promise<void> {
    const container = await this.requireContainer(serverId);

    await this.docker.containerCommand(
      "start",
      container.id,
      serverId,
    );
  }

  async stop(serverId: string): Promise<void> {
    const container = await this.requireContainer(serverId);

    await this.docker.containerCommand(
      "stop",
      container.id,
      serverId,
    );
  }

  async restart(serverId: string): Promise<void> {
    const container = await this.requireContainer(serverId);

    await this.docker.containerCommand(
      "restart",
      container.id,
      serverId,
    );
  }

  async kill(serverId: string): Promise<void> {
    const container = await this.requireContainer(serverId);

    await this.docker.containerCommand(
      "kill",
      container.id,
      serverId,
    );
  }

  private async requireContainer(serverId: string) {
    const container = await this.discovery.findByServerId(
      serverId,
    );

    if (
      !container ||
      !container.managed ||
      container.serverId !== serverId
    ) {
      throw new Error(
        "MatrixHost server container was not found or ownership verification failed.",
      );
    }

    return container;
  }
}
