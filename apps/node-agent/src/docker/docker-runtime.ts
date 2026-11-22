import { DockerClient } from "./docker-client.js";
import { DockerContainerDiscovery } from "./docker-container-discovery.js";
import { DockerNetworkManager } from "./docker-network-manager.js";
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
  ) {
    this.servers = new DockerServerManager(
      docker,
      networks,
      discovery,
    );
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
