import assert from "node:assert/strict";
import { test } from "node:test";

import { validateDockerCreateOptions } from "../src/docker/docker-validation.js";

const validOptions = {
  serverId: "a1f4c0b2-3d6e-4a8b-9c1d-2e3f4a5b6c7d",
  image: "ghcr.io/pterodactyl/yolks:java_21",
  startupCommand: "java -Xms128M -Xmx1024M -jar server.jar",
  environment: {
    SERVER_PORT: "25565",
    SERVER_MEMORY: "1024",
  },
  limits: {
    memoryBytes: 1024 * 1024 * 1024,
    memorySwapBytes: 1024 * 1024 * 1024,
    cpuPercent: 100,
    diskBytes: 5 * 1024 * 1024 * 1024,
    pidsLimit: 256,
  },
  networkName: "matrixhost-server-a1f4c0b2",
  ports: [
    {
      hostIp: "0.0.0.0",
      hostPort: 25565,
      containerPort: 25565,
      protocol: "tcp" as const,
    },
  ],
};

test("accepts a valid container specification", () => {
  assert.doesNotThrow(() => validateDockerCreateOptions(validOptions));
});

test("rejects invalid image references and environment keys", () => {
  assert.throws(() =>
    validateDockerCreateOptions({
      ...validOptions,
      image: "image name with spaces",
    }),
  );

  assert.throws(() =>
    validateDockerCreateOptions({
      ...validOptions,
      environment: { "BAD;KEY": "value" },
    }),
  );
});

test("rejects unsafe resource limits and startup commands containing NUL", () => {
  assert.throws(() =>
    validateDockerCreateOptions({
      ...validOptions,
      limits: { ...validOptions.limits, pidsLimit: 0 },
    }),
  );

  assert.throws(() =>
    validateDockerCreateOptions({
      ...validOptions,
      startupCommand: "java\u0000 -jar server.jar",
    }),
  );
});
