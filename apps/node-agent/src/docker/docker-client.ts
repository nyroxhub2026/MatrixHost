import { execFile } from "node:child_process";
import { isIP } from "node:net";

import type {
  DockerContainerCreateOptions,
  DockerContainerSnapshot,
} from "./docker.types.js";

const CONTAINER_ID_PATTERN =
  /^[a-f0-9]{12,64}$/i;

const SERVER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RESOURCE_NAME_PATTERN =
  /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

const IMAGE_PATTERN =
  /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,254}$/;

interface DockerInspectOutput {
  Id?: unknown;
  Name?: unknown;
  Config?: {
    Image?: unknown;
    Labels?: unknown;
  };
  State?: {
    Status?: unknown;
    Running?: unknown;
    ExitCode?: unknown;
  };
}

export type DockerContainerOperation =
  | "start"
  | "stop"
  | "restart"
  | "kill"
  | "remove";

export interface DockerClientOptions {
  timeoutMs?: number;
  maxBufferBytes?: number;
  managedLabel?: string;
  allowedImagePrefixes?: string[];
}

export class DockerClient {
  private readonly timeoutMs: number;
  private readonly maxBufferBytes: number;
  private readonly managedLabel: string;
  private readonly allowedImagePrefixes: string[];

  constructor(
    private readonly binary = "docker",
    options: DockerClientOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxBufferBytes =
      options.maxBufferBytes ?? 1024 * 1024;

    this.managedLabel =
      options.managedLabel ?? "matrixhost.managed";
    this.allowedImagePrefixes =
      options.allowedImagePrefixes ?? [];

    if (
      !Number.isInteger(this.timeoutMs) ||
      this.timeoutMs < 1000 ||
      this.timeoutMs > 120_000 ||
      !Number.isInteger(this.maxBufferBytes) ||
      this.maxBufferBytes < 65_536 ||
      this.maxBufferBytes > 16 * 1024 * 1024 ||
      !/^[a-zA-Z0-9_.-]{1,128}$/.test(
        this.managedLabel,
      ) ||
      this.allowedImagePrefixes.length > 50 ||
      this.allowedImagePrefixes.some(
        (prefix) =>
          !/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,254}$/.test(prefix),
      )
    ) {
      throw new Error("Invalid Docker client configuration.");
    }
  }

  async version(): Promise<string> {
    const output = await this.run([
      "version",
      "--format",
      "{{.Server.Version}}",
    ]);

    const version = output.stdout.trim();

    if (!version) {
      throw new Error(
        "Docker Engine version is unavailable.",
      );
    }

    return version;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.version();
      return true;
    } catch {
      return false;
    }
  }

  async inspectContainer(
    containerId: string,
  ): Promise<DockerContainerSnapshot | null> {
    this.validateContainerId(containerId);

    let result: {
      stdout: string;
      stderr: string;
    };

    try {
      result = await this.run([
        "inspect",
        "--format",
        "{{json .}}",
        containerId,
      ]);
    } catch (error) {
      if (
        error instanceof Error &&
        /No such (object|container)/i.test(error.message)
      ) {
        return null;
      }

      throw error;
    }

    let parsed: DockerInspectOutput;

    try {
      parsed = JSON.parse(result.stdout) as DockerInspectOutput;
    } catch {
      throw new Error(
        "Docker returned invalid inspect data.",
      );
    }

    const id = parsed.Id;
    const name = parsed.Name;
    const image = parsed.Config?.Image;
    const status = parsed.State?.Status;
    const running = parsed.State?.Running;
    const exitCode = parsed.State?.ExitCode;
    const labels = parsed.Config?.Labels;

    if (
      typeof id !== "string" ||
      !CONTAINER_ID_PATTERN.test(id) ||
      typeof name !== "string" ||
      typeof image !== "string" ||
      typeof status !== "string" ||
      typeof running !== "boolean" ||
      labels === null ||
      typeof labels !== "object" ||
      Array.isArray(labels)
    ) {
      throw new Error(
        "Docker returned incomplete container data.",
      );
    }

    const labelMap = labels as Record<string, unknown>;

    const serverId = labelMap["matrixhost.server-id"];
    const managed = labelMap[this.managedLabel] === "true";

    return {
      id,
      name: name.replace(/^\//, ""),
      image,
      status,
      running,
      exitCode:
        typeof exitCode === "number" &&
        Number.isInteger(exitCode)
          ? exitCode
          : null,
      serverId:
        typeof serverId === "string" &&
        SERVER_ID_PATTERN.test(serverId)
          ? serverId
          : null,
      managed,
    };
  }

  async createContainer(
    options: DockerContainerCreateOptions,
  ): Promise<string> {
    if (!SERVER_ID_PATTERN.test(options.serverId)) {
      throw new Error("Invalid server ID.");
    }

    if (
      !RESOURCE_NAME_PATTERN.test(options.name) ||
      !RESOURCE_NAME_PATTERN.test(options.networkName) ||
      !IMAGE_PATTERN.test(options.image) ||
      !this.allowedImagePrefixes.some((prefix) =>
        options.image.startsWith(prefix),
      )
    ) {
      throw new Error(
        "Invalid Docker container configuration.",
      );
    }

    if (
      !Number.isSafeInteger(options.memoryBytes) ||
      options.memoryBytes <= 0 ||
      !Number.isSafeInteger(options.memorySwapBytes) ||
      options.memorySwapBytes < options.memoryBytes ||
      !Number.isSafeInteger(options.cpuPercent) ||
      options.cpuPercent <= 0 ||
      options.cpuPercent > 100_000 ||
      !Number.isSafeInteger(options.diskBytes) ||
      options.diskBytes <= 0 ||
      !Number.isSafeInteger(options.pidsLimit) ||
      options.pidsLimit <= 0 ||
      options.pidsLimit > 100_000
    ) {
      throw new Error(
        "Invalid Docker resource limits.",
      );
    }

    if (
      typeof options.startupCommand !== "string" ||
      options.startupCommand.length === 0 ||
      options.startupCommand.length > 16_384 ||
      options.startupCommand.includes("\0")
    ) {
      throw new Error("Invalid Docker startup command.");
    }

    if (
      options.environment === null ||
      typeof options.environment !== "object" ||
      Array.isArray(options.environment)
    ) {
      throw new Error("Invalid Docker environment.");
    }

    if (
      !Array.isArray(options.ports) ||
      options.ports.length === 0 ||
      options.ports.length > 100
    ) {
      throw new Error("Invalid Docker port bindings.");
    }

    const seenPorts = new Set<string>();

    for (const port of options.ports) {
      if (
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

      const key = `${port.hostIp}:${port.hostPort}/${port.protocol}`;

      if (seenPorts.has(key)) {
        throw new Error("Duplicate Docker host port binding.");
      }

      seenPorts.add(key);
    }

    const entries = Object.entries(options.environment);

    if (entries.length > 100) {
      throw new Error(
        "Too many Docker environment variables.",
      );
    }

    const args = [
      "create",
      "--name",
      options.name,

      "--label",
      `matrixhost.server-id=${options.serverId}`,

      "--label",
      `${this.managedLabel}=true`,

      "--memory",
      String(options.memoryBytes),

      "--memory-swap",
      String(options.memorySwapBytes),

      "--cpus",
      String(options.cpuPercent / 100),

      "--pids-limit",
      String(options.pidsLimit),

      "--storage-opt",
      `size=${options.diskBytes}B`,

      "--cap-drop",
      "ALL",

      "--security-opt",
      "no-new-privileges:true",

      "--init",

      "--network",
      options.networkName,

      "--restart",
      "no",

      "--entrypoint",
      "/bin/sh",
    ];

    for (const port of options.ports) {
      if (
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

      const hostIp =
        isIP(port.hostIp) === 6
          ? `[${port.hostIp}]`
          : port.hostIp;

      args.push(
        "--publish",
        `${hostIp}:${port.hostPort}:${port.containerPort}/${port.protocol}`,
      );
    }

    for (const [key, value] of entries) {
      if (
        !/^[A-Z_][A-Z0-9_]*$/.test(key) ||
        typeof value !== "string" ||
        value.length > 4096 ||
        value.includes("\0")
      ) {
        throw new Error(
          "Invalid Docker environment variable.",
        );
      }

      args.push("--env", `${key}=${value}`);
    }

    args.push(
      options.image,
      "-lc",
      options.startupCommand,
    );

    const result = await this.run(args);
    const containerId = result.stdout.trim();

    if (!CONTAINER_ID_PATTERN.test(containerId)) {
      throw new Error(
        "Docker returned an invalid container ID.",
      );
    }

    return containerId;
  }

  async containerCommand(
    operation: DockerContainerOperation,
    containerId: string,
    expectedServerId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    this.validateContainerId(containerId);

    if (!SERVER_ID_PATTERN.test(expectedServerId)) {
      throw new Error("Invalid server ID.");
    }

    const container = await this.inspectContainer(containerId);

    if (
      !container ||
      container.serverId !== expectedServerId ||
      !container.managed
    ) {
      throw new Error(
        "Docker container ownership verification failed.",
      );
    }

    const commands: Record<
      DockerContainerOperation,
      string
    > = {
      start: "start",
      stop: "stop",
      restart: "restart",
      kill: "kill",
      remove: "rm",
    };

    await this.run(
      [
        commands[operation],
        containerId,
      ],
      signal,
    );
  }

  private validateContainerId(
    containerId: string,
  ): void {
    if (!CONTAINER_ID_PATTERN.test(containerId)) {
      throw new Error("Invalid Docker container ID.");
    }
  }

  private run(
    args: string[],
    signal?: AbortSignal,
  ): Promise<{
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve, reject) => {
      execFile(
        this.binary,
        args,
        {
          timeout: this.timeoutMs,
          maxBuffer: this.maxBufferBytes,
          windowsHide: true,
          encoding: "utf8",
          shell: false,
          ...(signal ? { signal } : {}),
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(
              new Error(
                `Docker command failed: ${
                  stderr.trim() || error.message
                }`,
              ),
            );

            return;
          }

          resolve({
            stdout,
            stderr,
          });
        },
      );
    });
  }
}
