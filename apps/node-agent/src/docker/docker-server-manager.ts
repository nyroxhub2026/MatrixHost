import { createHash } from "node:crypto";

import { DockerClient } from "./docker-client.js";
import { DockerContainerDiscovery } from "./docker-container-discovery.js";
import { DockerNetworkManager } from "./docker-network-manager.js";
import { DockerInstallerRunner } from "./docker-installer-runner.js";
import { validateDockerCreateOptions } from "./docker-validation.js";

import type { DockerCreateOptions } from "./docker.types.js";

class DockerInstallerExecutionError extends Error {
  constructor(cause: unknown) {
    super("Egg installation failed inside the restricted installer container.", { cause });
    this.name = "DockerInstallerExecutionError";
  }
}

export class DockerServerManager {
  constructor(
    private readonly docker: DockerClient,
    private readonly networks: DockerNetworkManager,
    private readonly discovery: DockerContainerDiscovery,
    private readonly installer: DockerInstallerRunner,
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
      installer: options.installer ?? null,
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
        existing.mountTargets.length > 0 ||
        !existingNetwork ||
        existingNetwork.serverId !== options.serverId
      ) {
        throw new Error(
          "An existing MatrixHost container does not match this server configuration.",
        );
      }

      await this.ensureInstalled(existing.id, options, signal);

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
        startupCommand: options.installer
          ? `while [ ! -f /var/lib/matrixhost/install-complete ]; do sleep 1; done; ${options.startupCommand}`
          : options.startupCommand,
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

      const createdContainer =
        await this.discovery.findByServerId(options.serverId);

      if (
        !createdContainer ||
        createdContainer.id !== containerId ||
        createdContainer.configHash !== configHash
      ) {
        throw new Error(
          "Created container could not be verified.",
        );
      }

      if (createdContainer.mountTargets.length > 0) {
        await this.docker.containerCommand(
          "remove",
          createdContainer.id,
          options.serverId,
        );

        throw new Error(
          "The selected image declares external volumes. Disk quota cannot be guaranteed for this image.",
        );
      }

      await this.ensureInstalled(containerId, options, signal);

      return {
        serverId: options.serverId,
        containerId,
        networkName: options.networkName,
      };
    } catch (creationError) {
      if (creationError instanceof DockerInstallerExecutionError) {
        throw creationError;
      }
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

      if (discoveredContainer?.mountTargets.length) {
        try {
          await this.docker.containerCommand(
            "remove",
            discoveredContainer.id,
            options.serverId,
          );
          discoveredContainer = null;
        } catch {
          throw new Error(
            "An image-created volume was detected and its unstarted container could not be cleaned up.",
            { cause: creationError },
          );
        }
      }

      if (discoveredContainer) {
        if (
          discoveredContainer.image === options.image &&
          discoveredContainer.configHash === configHash &&
          discoveredContainer.mountTargets.length === 0
        ) {
          await this.ensureInstalled(discoveredContainer.id, options, signal);
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

  private async ensureInstalled(
    containerId: string,
    options: DockerCreateOptions,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!options.installer) {
      return;
    }

    await this.docker.containerCommand(
      "start",
      containerId,
      options.serverId,
      signal,
    );

    let installError: unknown;

    try {
      await this.installer.install({
        serverId: options.serverId,
        targetContainerId: containerId,
        networkName: options.networkName,
        image: options.installer.image,
        ...(options.installer.entrypoint
          ? { entrypoint: options.installer.entrypoint }
          : {}),
        script: options.installer.script,
        environment: options.installer.environment,
        limits: {
          memoryBytes: options.limits.memoryBytes,
          memorySwapBytes: options.limits.memorySwapBytes,
          cpuPercent: options.limits.cpuPercent,
          diskBytes: options.limits.diskBytes,
          pidsLimit: options.limits.pidsLimit,
        },
      }, signal);
    } catch (error) {
      installError = error;
    }

    try {
      const container = await this.docker.inspectContainer(containerId);

      if (container?.running) {
        await this.docker.containerCommand(
          "stop",
          containerId,
          options.serverId,
        );
      }
    } catch (stopError) {
      throw new DockerInstallerExecutionError(
        installError
          ? new AggregateError([installError, stopError], "Installer failed and the server container could not be stopped.")
          : stopError,
      );
    }

    if (installError) {
      throw new DockerInstallerExecutionError(installError);
    }
  }

  async delete(
    serverId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    // Discovery validates the UUID and verifies MatrixHost ownership.
    const container = await this.discovery.findByServerId(serverId);

    if (container) {
      if (container.mountTargets.length > 0) {
        throw new Error(
          "Refusing to delete a server container with external mounts.",
        );
      }

      if (container.running) {
        await this.docker.containerCommand(
          "stop",
          container.id,
          serverId,
          signal,
        );
      }

      await this.docker.containerCommand(
        "remove",
        container.id,
        serverId,
        signal,
      );
    }

    // Keep backup archives untouched. Network cleanup is idempotent and
    // can be retried if Docker reports that another container is attached.
    const networkName = `matrixhost-${serverId}`;
    const network = await this.networks.find(networkName);

    if (network) {
      if (!network.managed || network.serverId !== serverId) {
        throw new Error("Docker network ownership verification failed.");
      }

      await this.networks.remove(networkName, serverId, signal);
    }
  }

  async find(serverId: string) {
    return this.discovery.findByServerId(serverId);
  }

  async list() {
    return this.discovery.listManaged();
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
