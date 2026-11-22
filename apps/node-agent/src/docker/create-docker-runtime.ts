import { DockerClient } from "./docker-client.js";
import { DockerContainerDiscovery } from "./docker-container-discovery.js";
import { DockerNetworkManager } from "./docker-network-manager.js";
import { DockerInstallerRunner } from "./docker-installer-runner.js";
import { DockerBackupManager } from "./docker-backup-manager.js";
import { DockerRuntime } from "./docker-runtime.js";

import type { DockerConfig } from "./docker.config.js";

export interface CreateDockerRuntimeOptions {
  config?: DockerConfig;
  dockerBinary?: string;
}

export function createDockerRuntime(options: CreateDockerRuntimeOptions = {}): DockerRuntime {
  const config = options.config;
  const binary = options.dockerBinary ?? config?.DOCKER_BINARY ?? "docker";
  const timeoutMs = config?.DOCKER_COMMAND_TIMEOUT_MS ?? 30000;
  const maxBufferBytes = config?.DOCKER_MAX_BUFFER_BYTES ?? 1024 * 1024;
  const managedLabel = config?.DOCKER_MANAGED_LABEL ?? "matrixhost.managed";

  const docker = new DockerClient(binary, {
    timeoutMs,
    maxBufferBytes,
    managedLabel,
    allowedImagePrefixes: config?.DOCKER_ALLOWED_IMAGE_PREFIXES ?? [],
  });

  const networks = new DockerNetworkManager(binary, {
    timeoutMs,
    maxBufferBytes,
    managedLabel,
  });

  const discovery = new DockerContainerDiscovery(docker, binary, {
    timeoutMs,
    maxBufferBytes,
    managedLabel,
  });

  const installer = new DockerInstallerRunner(binary, {
    timeoutMs: config?.DOCKER_INSTALLER_TIMEOUT_MS ?? 900000,
    maxBufferBytes,
    managedLabel,
    allowedImagePrefixes: config?.DOCKER_ALLOWED_INSTALLER_IMAGE_PREFIXES ?? ["ghcr.io/pterodactyl/installers:"],
  });

  const backups = new DockerBackupManager(binary, {
    directory: config?.DOCKER_BACKUP_DIRECTORY,
    timeoutMs: config?.DOCKER_BACKUP_TIMEOUT_MS,
    maxBackupBytes: config?.DOCKER_BACKUP_MAX_BYTES,
  });

  return new DockerRuntime(docker, networks, discovery, installer, backups);
}
