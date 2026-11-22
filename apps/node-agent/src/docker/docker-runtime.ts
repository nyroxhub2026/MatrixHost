import { DockerClient } from "./docker-client.js";
import { DockerVolumeManager } from "./docker-volume-manager.js";
import { DockerContainerDiscovery } from "./docker-container-discovery.js";
import { DockerServerManager } from "./docker-server-manager.js";

export interface DockerRuntimeStatus {
  available: boolean;
  version: string | null;
}

export class DockerRuntime {
  readonly servers: DockerServerManager;

  constructor(
    private readonly docker: DockerClient,
    volumes: DockerVolumeManager,
    discovery: DockerContainerDiscovery,
  ) {
    this.servers = new DockerServerManager(
      docker,
      volumes,
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
    // Containers are intentionally not stopped here.
    // Node Agent shutdown must not stop customer servers.
  }
}
