import { createHash } from "node:crypto";

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
    signal?: AbortSignal,
  ): Promise<{
    serverId: string;
    containerId: string;
    networkName: string;
  }> {
    validateDockerCreateOptions(options);

    const normalizedConfiguration = {
      serverId: options.serverId,
      image: options.image,
      startupCommand: options.startupCommand,
      environment: Object.fromEntries(
        Object.entries(options.environment).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      ),
      limits: options.limits,
      networkName: options.networkName,
      ports: [...options.ports].sort((a, b) =>
        `${a.hostIp}:${a.hostPort}/${a.protocol}`.localeCompare(
          `${b.hostIp}:${b.hostPort}/${b.protocol}`,
        ),
      ),
    };

    const configHash = createHash("sha256")
      .update(JSON.stringify(normalizedConfiguration))
      .digest("hex");

    const existing = await this.discovery.findByServerId(
      options.serverId,
    );

    if (existing) {
      const existingNetwork = await this.networks.find(
        options.networkName,
      );

      if (
        existing.image !== options.image ||
        existing.configHash !== configHash ||
        !existingNetwork ||
        existingNetwork.serverId !== options.serverId
      ) {
        throw new Error(
          "An existing MatrixHost container does not match this server configuration.",
        );
      }

      return {
        serverId: options.serverId,
        containerId: existing.id,
        networkName: options.networkName,
      };
    }

    let networkCreated = false;
    const existingNetwork = await this.networks.find(
      options.networkName,
    );

    if (existingNetwork) {
      if (existingNetwork.serverId !== options.serverId) {
        throw new Error(
          "Docker network ownership verification failed.",
        );
      }
    } else {
      await this.networks.create(
        options.networkName,
        options.serverId,
        signal,
      );
      networkCreated = true;
    }

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
        configHash,
      }, signal);

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
        if (
          discoveredContainer.image === options.image &&
          discoveredContainer.configHash === configHash
        ) {
          return {
            serverId: options.serverId,
            containerId: discoveredContainer.id,
            networkName: options.networkName,
          };
        }

        throw new Error(
          "A container exists but does not match the requested configuration. The network was retained.",
          { cause: creationError },
        );
      }

      if (networkCreated) {
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

    if (container.running) {
      return;
    }

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

    if (!container.running) {
      return;
    }

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

    if (!container.running) {
      return;
    }

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
