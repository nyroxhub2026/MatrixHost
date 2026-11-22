import { DockerClient } from "./docker-client.js";
import { DockerContainerDiscovery } from "./docker-container-discovery.js";
import { DockerNetworkManager } from "./docker-network-manager.js";
import { DockerInstallerRunner } from "./docker-installer-runner.js";
import { DockerServerManager } from "./docker-server-manager.js";

export interface DockerRuntimeStatus {
  available: boolean;
  version: string | null;
}

export class DockerRuntime {
  readonly servers: DockerServerManager;

  constructor(
    private readonly docker: DockerClient,
    networks: DockerNetworkManager,
    discovery: DockerContainerDiscovery,
    private readonly installer: DockerInstallerRunner,
  ) {
    this.servers = new DockerServerManager(
      docker,
      networks,
      discovery,
      installer,
    );
  }

  async cleanupOrphanedInstallers(): Promise<number> {
    return this.installer.cleanupOrphanedInstallers();
  }

  async status(): Promise<DockerRuntimeStatus> {
    try {
      const version = await this.docker.version();

      return {
        available: true,
        version,
      };
    } catch {
      return {
        available: false,
        version: null,
      };
    }
  }

  async shutdown(): Promise<void> {
    // Customer containers are intentionally left running.
  }
}
