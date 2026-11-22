import { isIP } from "node:net";

import type {
  DockerCreateOptions,
  DockerResourceLimits,
} from "./docker.types.js";

const MAX_ENVIRONMENT_VARIABLES = 100;
const MAX_ENVIRONMENT_VALUE_LENGTH = 4096;
const MAX_STARTUP_COMMAND_LENGTH = 16_384;

const SERVER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const IMAGE_PATTERN =
  /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,254}$/;

const RESOURCE_NAME_PATTERN =
  /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

function assertPositiveSafeInteger(
  value: number,
  field: string,
): void {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(`Invalid Docker resource limit: ${field}.`);
  }
}

export function validateDockerResourceLimits(
  limits: DockerResourceLimits,
): void {
  assertPositiveSafeInteger(
    limits.memoryBytes,
    "memoryBytes",
  );

  assertPositiveSafeInteger(
    limits.diskBytes,
    "diskBytes",
  );

  assertPositiveSafeInteger(
    limits.pidsLimit,
    "pidsLimit",
  );

  assertPositiveSafeInteger(
    limits.cpuPercent,
    "cpuPercent",
  );

  if (
    !Number.isSafeInteger(limits.memorySwapBytes) ||
    limits.memorySwapBytes < limits.memoryBytes
  ) {
    throw new Error("Invalid Docker memory swap limit.");
  }

  if (limits.cpuPercent > 100_000) {
    throw new Error("Docker CPU limit is too large.");
  }

  if (limits.pidsLimit > 100_000) {
    throw new Error("Docker PID limit is too large.");
  }
}

export function validateDockerCreateOptions(
  options: DockerCreateOptions,
): void {
  if (!SERVER_ID_PATTERN.test(options.serverId)) {
    throw new Error("Invalid server ID.");
  }

  if (!IMAGE_PATTERN.test(options.image)) {
    throw new Error("Invalid Docker image reference.");
  }

  if (
    typeof options.startupCommand !== "string" ||
    options.startupCommand.length === 0 ||
    options.startupCommand.length > MAX_STARTUP_COMMAND_LENGTH ||
    options.startupCommand.includes("\0")
  ) {
    throw new Error("Invalid startup command.");
  }

  if (
    !RESOURCE_NAME_PATTERN.test(options.networkName)
  ) {
    throw new Error("Invalid Docker resource name.");
  }

  const environment = options.environment;

  if (
    environment === null ||
    typeof environment !== "object" ||
    Array.isArray(environment)
  ) {
    throw new Error("Invalid environment variables.");
  }

  const entries = Object.entries(environment);

  if (entries.length > MAX_ENVIRONMENT_VARIABLES) {
    throw new Error("Too many environment variables.");
  }

  for (const [key, value] of entries) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      throw new Error("Invalid environment variable name.");
    }

    if (
      typeof value !== "string" ||
      value.length > MAX_ENVIRONMENT_VALUE_LENGTH ||
      value.includes("\0")
    ) {
      throw new Error(`Invalid environment variable: ${key}.`);
    }
  }

  if (
    !Array.isArray(options.ports) ||
    options.ports.length === 0 ||
    options.ports.length > 100
  ) {
    throw new Error("At least one valid Docker port binding is required.");
  }

  const seenBindings = new Set<string>();

  for (const port of options.ports) {
    if (
      typeof port.hostIp !== "string" ||
      isIP(port.hostIp) === 0 ||
      !Number.isInteger(port.hostPort) ||
      port.hostPort < 1 ||
      port.hostPort > 65535 ||
      !Number.isInteger(port.containerPort) ||
      port.containerPort < 1 ||
      port.containerPort > 65535 ||
      (port.protocol !== "tcp" && port.protocol !== "udp")
    ) {
      throw new Error("Invalid Docker port binding.");
    }

    const bindingKey =
      `${port.hostIp}:${port.hostPort}/${port.protocol}`;

    if (seenBindings.has(bindingKey)) {
      throw new Error("Duplicate Docker host port binding.");
    }

    seenBindings.add(bindingKey);
  }

  validateDockerResourceLimits(options.limits);
}
