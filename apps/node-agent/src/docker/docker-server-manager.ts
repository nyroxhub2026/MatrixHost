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

    await this.volumes.create(
      options.volumeName,
      options.serverId,
    );

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
  }

  async find(
    serverId: string,
  ) {
    return this.discovery.findByServerId(serverId);
  }

  async start(
    serverId: string,
  ): Promise<void> {
    const container = await this.requireContainer(serverId);

    await this.docker.containerCommand(
      "start",
      container.id,
      serverId,
    );
  }

  async stop(
    serverId: string,
  ): Promise<void> {
    const container = await this.requireContainer(serverId);

    await this.docker.containerCommand(
      "stop",
      container.id,
      serverId,
    );
  }

  async restart(
    serverId: string,
  ): Promise<void> {
    const container = await this.requireContainer(serverId);

    await this.docker.containerCommand(
      "restart",
      container.id,
      serverId,
    );
  }

  async kill(
    serverId: string,
  ): Promise<void> {
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

    if (!container) {
      throw new Error(
        "MatrixHost server container was not found.",
      );
    }

    return container;
  }
}
