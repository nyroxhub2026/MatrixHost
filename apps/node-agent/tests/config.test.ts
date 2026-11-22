import assert from "node:assert/strict";
import { test } from "node:test";

import { loadAgentConfig } from "../src/config.js";
import { loadDockerConfig } from "../src/docker/docker.config.js";

test("loads Agent configuration without rejecting unrelated environment values", () => {
  const config = loadAgentConfig({
    NODE_ID: "8d4d6c68-7f63-4b67-9b25-8c1b9d2d8a31",
    API_BASE_URL: "https://api.example.test",
    AGENT_TOKEN: "a".repeat(48),
    NODE_ENV: "production",
    PATH: "/usr/local/bin",
    HOME: "/var/lib/matrixhost",
  });

  assert.equal(config.NODE_ID, "8d4d6c68-7f63-4b67-9b25-8c1b9d2d8a31");
  assert.equal(config.HEARTBEAT_INTERVAL_MS, 15000);
});

test("parses a comma-separated Docker image allowlist", () => {
  const config = loadDockerConfig({
    DOCKER_ALLOWED_IMAGE_PREFIXES:
      "ghcr.io/pterodactyl/yolks:,registry.example.test/matrixhost/",
    DOCKER_DEFAULT_PIDS_LIMIT: "768",
  });

  assert.deepEqual(config.DOCKER_ALLOWED_IMAGE_PREFIXES, [
    "ghcr.io/pterodactyl/yolks:",
    "registry.example.test/matrixhost/",
  ]);
  assert.equal(config.DOCKER_DEFAULT_PIDS_LIMIT, 768);
});
