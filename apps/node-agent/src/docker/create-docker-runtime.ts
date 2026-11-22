import { DockerClient } from "./docker-client.js";
import { DockerVolumeManager } from "./docker-volume-manager.js";
import { DockerContainerDiscovery } from "./docker-container-discovery.js";
import { DockerRuntime } from "./docker-runtime.js";

import type { DockerConfig } from "./docker.config.js";

export interface CreateDockerRuntimeOptions {
  config?: DockerConfig;
  dockerBinary?: string;
}

export function createDockerRuntime(
  options: CreateDockerRuntimeOptions = {},
): DockerRuntime {
  const config = options.config;

  const binary =
    options.dockerBinary ??
    config?.DOCKER_BINARY ??
    "docker";

  const timeoutMs =
    config?.DOCKER_COMMAND_TIMEOUT_MS ?? 30_000;

  const maxBufferBytes =
    config?.DOCKER_MAX_BUFFER_BYTES ?? 1024 * 1024;

  const managedLabel =
    config?.DOCKER_MANAGED_LABEL ??
    "matrixhost.managed";

  const docker = new DockerClient(binary, {
    timeoutMs,
    maxBufferBytes,
    managedLabel,
  });

  const volumes = new DockerVolumeManager(binary, {
    timeoutMs,
    maxBufferBytes,
    managedLabel,
  });

  const discovery = new DockerContainerDiscovery(
    docker,
    binary,
    {
      timeoutMs,
      maxBufferBytes,
      managedLabel,
    },
  );

  return new DockerRuntime(
    docker,
    volumes,
    discovery,
  );
}
