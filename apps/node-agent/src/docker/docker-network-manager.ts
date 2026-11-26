import { execFile } from "node:child_process";

import type { DockerNetworkInfo } from "./docker.types.js";

const SERVER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const NETWORK_NAME_PATTERN =
  /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

interface DockerNetworkInspect {
  Name?: unknown;
  Id?: unknown;
  Driver?: unknown;
  Labels?: unknown;
}

export interface DockerNetworkManagerOptions {
  timeoutMs?: number;
  maxBufferBytes?: number;
  managedLabel?: string;
}

export class DockerNetworkManager {
  private readonly timeoutMs: number;
  private readonly maxBufferBytes: number;
  private readonly managedLabel: string;

  constructor(
    private readonly binary = "docker",
    options: DockerNetworkManagerOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxBufferBytes =
      options.maxBufferBytes ?? 1024 * 1024;
    this.managedLabel =
      options.managedLabel ?? "matrixhost.managed";

    if (
      !Number.isInteger(this.timeoutMs) ||
      this.timeoutMs < 1000 ||
      this.timeoutMs > 120_000 ||
      !Number.isInteger(this.maxBufferBytes) ||
      this.maxBufferBytes < 65_536 ||
      this.maxBufferBytes > 16 * 1024 * 1024 ||
      !/^[a-zA-Z0-9_.-]{1,128}$/.test(this.managedLabel)
    ) {
      throw new Error("Invalid Docker network manager configuration.");
    }
  }

  async create(
    networkName: string,
    serverId: string,
    signal?: AbortSignal,
  ): Promise<DockerNetworkInfo> {
    this.validate(networkName, serverId);

    const existing = await this.inspect(networkName);

    if (existing) {
      throw new Error(
        existing.serverId === serverId
          ? "Docker network already exists for this server."
          : "Docker network ownership verification failed.",
      );
    }

    await this.run([
      "network",
      "create",
      "--driver",
      "bridge",
      "--opt",
      "com.docker.network.bridge.enable_icc=false",
      "--label",
      `${this.managedLabel}=true`,
      "--label",
      `matrixhost.server-id=${serverId}`,
      networkName,
    ], signal);

    const created = await this.inspect(networkName);

    if (
      !created ||
      created.name !== networkName ||
      created.serverId !== serverId ||
      created.driver !== "bridge"
    ) {
      throw new Error(
        "Docker network creation could not be verified.",
      );
    }

    return created;
  }

  async find(
    networkName: string,
  ): Promise<DockerNetworkInfo | null> {
    return this.inspect(networkName);
  }

  async inspect(
    networkName: string,
  ): Promise<DockerNetworkInfo | null> {
    if (!NETWORK_NAME_PATTERN.test(networkName)) {
      throw new Error("Invalid Docker network name.");
    }

    let result: { stdout: string; stderr: string };

    try {
      result = await this.run([
        "network",
        "inspect",
        networkName,
      ]);
    } catch (error) {
      if (
        error instanceof Error &&
        /no such network|network .+ not found/i.test(error.message)
      ) {
        return null;
      }

      throw error;
    }

    let parsed: DockerNetworkInspect[];

    try {
      parsed = JSON.parse(result.stdout) as DockerNetworkInspect[];
    } catch {
      throw new Error("Docker returned invalid network data.");
    }

    const network = parsed[0];

    if (!network) {
      return null;
    }

    const labels = network.Labels;

    if (
      network.Name !== networkName ||
      typeof network.Id !== "string" ||
      !/^[a-f0-9]{12,64}$/i.test(network.Id) ||
      typeof network.Driver !== "string" ||
      labels === null ||
      typeof labels !== "object" ||
      Array.isArray(labels)
    ) {
      throw new Error("Docker returned incomplete network data.");
    }

    const labelMap = labels as Record<string, unknown>;
    const serverId = labelMap["matrixhost.server-id"];

    if (
      labelMap[this.managedLabel] !== "true" ||
      typeof serverId !== "string" ||
      !SERVER_ID_PATTERN.test(serverId)
    ) {
      throw new Error("Network is not managed by MatrixHost.");
    }

    return {
      id: network.Id,
      name: network.Name,
      driver: network.Driver,
      serverId,
      managed: true,
    };
  }

  async remove(
    networkName: string,
    expectedServerId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    this.validate(networkName, expectedServerId);

    const network = await this.inspect(networkName);

    if (!network) {
      return;
    }

    if (
      network.serverId !== expectedServerId ||
      !network.managed
    ) {
      throw new Error("Docker network ownership verification failed.");
    }

    await this.run([
      "network",
      "rm",
      networkName,
    ], signal);
  }

  private validate(
    networkName: string,
    serverId: string,
  ): void {
    if (!NETWORK_NAME_PATTERN.test(networkName)) {
      throw new Error("Invalid Docker network name.");
    }

    if (!SERVER_ID_PATTERN.test(serverId)) {
      throw new Error("Invalid server ID.");
    }
  }

  private run(
    args: string[],
    signal?: AbortSignal,
  ): Promise<{ stdout: string; stderr: string }> {
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
                `Docker network command failed: ${stderr.trim() || error.message}`,
              ),
            );
            return;
          }

          resolve({ stdout, stderr });
        },
      );
    });
  }
}
