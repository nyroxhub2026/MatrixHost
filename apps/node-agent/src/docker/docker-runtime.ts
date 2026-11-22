import { DockerClient } from "./docker-client.js";
import { DockerContainerDiscovery } from "./docker-container-discovery.js";
import { DockerNetworkManager } from "./docker-network-manager.js";
import { DockerInstallerRunner } from "./docker-installer-runner.js";
import { DockerBackupManager } from "./docker-backup-manager.js";
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
    readonly backups: DockerBackupManager,
  ) {
    this.servers = new DockerServerManager(docker, networks, discovery, installer);
  }

  async cleanupOrphanedInstallers(): Promise<number> {
    return this.installer.cleanupOrphanedInstallers();
  }

  async status(): Promise<DockerRuntimeStatus> {
    try {
      return { available: true, version: await this.docker.version() };
    } catch {
      return { available: false, version: null };
    }
  }

  async shutdown(): Promise<void> {
    // Customer containers and verified backup archives are intentionally retained.
  }
}
