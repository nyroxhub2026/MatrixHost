import { DockerClient } from "./docker-client.js";
import { DockerContainerDiscovery } from "./docker-container-discovery.js";
import { DockerNetworkManager } from "./docker-network-manager.js";
import { validateDockerCreateOptions } from "./docker-validation.js";

import type { DockerCreateOptions } from "./docker.types.js";

export class DockerServerManager {
  constructor(
    private readonly docker: DockerClient,
    private readonly networks: DockerNetworkManager,
    private readonly discovery: DockerContainerDiscovery,
  ) {}

  async create(
    options: DockerCreateOptions,
  ): Promise<{
    serverId: string;
    containerId: string;
    networkName: string;
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

    const existingNetwork = await this.networks.find(
      options.networkName,
    );

    if (existingNetwork) {
      throw new Error(
        "A Docker network already exists for this server.",
      );
    }

    await this.networks.create(
      options.networkName,
      options.serverId,
    );

    try {
      const containerId = await this.docker.createContainer({
        serverId: options.serverId,
        image: options.image,
        name: `matrixhost-${options.serverId}`,
        startupCommand: options.startupCommand,
        environment: options.environment,
        memoryBytes: options.limits.memoryBytes,
        memorySwapBytes: options.limits.memorySwapBytes,
        cpuPercent: options.limits.cpuPercent,
        diskBytes: options.limits.diskBytes,
        pidsLimit: options.limits.pidsLimit,
        networkName: options.networkName,
        ports: options.ports,
      });

      return {
        serverId: options.serverId,
        containerId,
        networkName: options.networkName,
      };
    } catch (creationError) {
      let discoveredContainer = null;

      try {
        discoveredContainer =
          await this.discovery.findByServerId(options.serverId);
      } catch {
        throw new Error(
          "Container creation could not be confirmed. The network was retained for safe manual reconciliation.",
          { cause: creationError },
        );
      }

      if (discoveredContainer) {
        throw new Error(
          "The container exists but its creation response was invalid. The network was retained.",
          { cause: creationError },
        );
      }

      try {
        await this.networks.remove(
          options.networkName,
          options.serverId,
        );
      } catch {
        throw new Error(
          "Container creation failed and network cleanup also failed. Manual inspection is required.",
          { cause: creationError },
        );
      }

      throw creationError;
    }
  }

  async find(serverId: string) {
    return this.discovery.findByServerId(serverId);
  }

  async start(
    serverId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const container = await this.requireContainer(serverId);

    await this.docker.containerCommand(
      "start",
      container.id,
      serverId,
      signal,
    );
  }

  async stop(
    serverId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const container = await this.requireContainer(serverId);

    await this.docker.containerCommand(
      "stop",
      container.id,
      serverId,
      signal,
    );
  }

  async restart(
    serverId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const container = await this.requireContainer(serverId);

    await this.docker.containerCommand(
      "restart",
      container.id,
      serverId,
      signal,
    );
  }

  async kill(
    serverId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const container = await this.requireContainer(serverId);

    await this.docker.containerCommand(
      "kill",
      container.id,
      serverId,
      signal,
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
