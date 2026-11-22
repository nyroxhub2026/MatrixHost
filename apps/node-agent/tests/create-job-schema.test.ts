import assert from "node:assert/strict";
import { test } from "node:test";

import { createServerJobPayloadSchema } from "../src/jobs/job.schemas.js";

test("accepts a server creation job with validated resources and allocation", () => {
  const result = createServerJobPayloadSchema.safeParse({
    image: "ghcr.io/pterodactyl/yolks:java_21",
    startup: "java -Xms128M -Xmx1024M -jar server.jar",
    environment: {
      SERVER_PORT: "25565",
    },
    limits: {
      memoryBytes: 1024 * 1024 * 1024,
      swapBytes: 0,
      diskBytes: 5 * 1024 * 1024 * 1024,
      cpuPercent: 100,
    },
    ports: [
      {
        hostIp: "0.0.0.0",
        hostPort: 25565,
        containerPort: 25565,
        protocol: "tcp",
      },
    ],
  });

  assert.equal(result.success, true);
});

test("rejects a server creation job without a published port", () => {
  const result = createServerJobPayloadSchema.safeParse({
    image: "ghcr.io/pterodactyl/yolks:java_21",
    startup: "java -jar server.jar",
    environment: {},
    limits: {
      memoryBytes: 1024,
      swapBytes: 0,
      diskBytes: 1024,
      cpuPercent: 100,
    },
    ports: [],
  });

  assert.equal(result.success, false);
});


test("accepts a validated isolated Egg installer payload", () => {
  const result = createServerJobPayloadSchema.safeParse({
    image: "ghcr.io/pterodactyl/yolks:java_21",
    startup: "java -jar server.jar",
    environment: {
      SERVER_PORT: "25565",
    },
    limits: {
      memoryBytes: 1024 * 1024 * 1024,
      swapBytes: 0,
      diskBytes: 5 * 1024 * 1024 * 1024,
      cpuPercent: 100,
    },
    ports: [
      {
        hostIp: "0.0.0.0",
        hostPort: 25565,
        containerPort: 25565,
        protocol: "tcp",
      },
    ],
    install: {
      image: "ghcr.io/pterodactyl/installers:alpine",
      entrypoint: "/bin/bash",
      script: "mkdir -p /mnt/server",
      environment: {
        SERVER_PORT: "25565",
      },
    },
  });

  assert.equal(result.success, true);
});

test("rejects an oversized Egg installer script", () => {
  const result = createServerJobPayloadSchema.safeParse({
    image: "ghcr.io/pterodactyl/yolks:java_21",
    startup: "java -jar server.jar",
    environment: {},
    limits: {
      memoryBytes: 1024,
      swapBytes: 0,
      diskBytes: 1024,
      cpuPercent: 100,
    },
    ports: [
      {
        hostIp: "0.0.0.0",
        hostPort: 25565,
        containerPort: 25565,
        protocol: "tcp",
      },
    ],
    install: {
      image: "ghcr.io/pterodactyl/installers:alpine",
      script: "x".repeat(256 * 1024 + 1),
      environment: {},
    },
  });

  assert.equal(result.success, false);
});
