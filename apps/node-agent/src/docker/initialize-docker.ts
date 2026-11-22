import {
  createDockerRuntime,
} from "./create-docker-runtime.js";

import {
  loadDockerConfig,
} from "./docker.config.js";

import {
  DockerHealthCheck,
} from "./docker-health-check.js";

export async function initializeDocker() {
  const config = loadDockerConfig();

  const runtime = createDockerRuntime({
    dockerBinary: config.DOCKER_BINARY,
  });

  const healthCheck = new DockerHealthCheck(runtime);

  const health = await healthCheck.check();

  if (
    config.DOCKER_REQUIRE_AVAILABLE &&
    !health.healthy
  ) {
    throw new Error(
      "Docker is required but is not available.",
    );
  }

  return {
    config,
    runtime,
    healthCheck,
    initialHealth: health,
  };
}
