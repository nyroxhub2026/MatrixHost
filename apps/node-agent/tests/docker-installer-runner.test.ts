import assert from "node:assert/strict";
import { test } from "node:test";

import { DockerInstallerRunner } from "../src/docker/docker-installer-runner.js";

const serverId = "123e4567-e89b-42d3-a456-426614174000";
const containerId = "a".repeat(64);

function createRunner() {
  return new DockerInstallerRunner("docker", {
    allowedImagePrefixes: ["ghcr.io/pterodactyl/installers:"],
  });
}

function createOptions() {
  return {
    serverId,
    targetContainerId: containerId,
    networkName: `matrixhost-${serverId}`,
    image: "ghcr.io/pterodactyl/installers:alpine",
    entrypoint: "/bin/bash",
    script: "mkdir -p /mnt/server",
    environment: {
      SERVER_PORT: "25565",
    },
    limits: {
      memoryBytes: 512 * 1024 * 1024,
      memorySwapBytes: 512 * 1024 * 1024,
      cpuPercent: 100,
      diskBytes: 1024 * 1024 * 1024,
      pidsLimit: 512,
    },
  };
}

test("rejects installer images outside the administrator allowlist", async () => {
  const runner = createRunner();
  const options = createOptions();
  options.image = "untrusted.example/installer:latest";

  await assert.rejects(
    runner.install(options),
    /Installer image or network is not allowed/,
  );
});

test("rejects unsafe installer entrypoints before Docker execution", async () => {
  const runner = createRunner();
  const options = createOptions();
  options.entrypoint = "/bin/bash; id";

  await assert.rejects(
    runner.install(options),
    /Invalid installer entrypoint/,
  );
});

test("rejects installer scripts larger than the bounded limit", async () => {
  const runner = createRunner();
  const options = createOptions();
  options.script = "x".repeat(256 * 1024 + 1);

  await assert.rejects(
    runner.install(options),
    /Invalid or oversized Egg installation script/,
  );
});
