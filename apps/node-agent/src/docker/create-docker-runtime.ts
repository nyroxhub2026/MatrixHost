import { DockerClient } from "./docker-client.js";
import { DockerVolumeManager } from "./docker-volume-manager.js";
import { DockerContainerDiscovery } from "./docker-container-discovery.js";
import { DockerRuntime } from "./docker-runtime.js";

export interface CreateDockerRuntimeOptions {
  dockerBinary?: string;
}

export function createDockerRuntime(
  options: CreateDockerRuntimeOptions = {},
): DockerRuntime {
  const docker = new DockerClient(
    options.dockerBinary ?? "docker",
  );

  const volumes = new DockerVolumeManager(
    options.dockerBinary ?? "docker",
  );

  const discovery = new DockerContainerDiscovery(
    docker,
    options.dockerBinary ?? "docker",
  );

  return new DockerRuntime(
    docker,
    volumes,
    discovery,
  );
}
