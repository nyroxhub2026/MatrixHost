import { execFile } from "node:child_process";

import { DockerClient } from "./docker-client.js";

import type {
  DockerContainerSnapshot,
} from "./docker-client.js";

const SERVER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONTAINER_ID_PATTERN =
  /^[a-f0-9]{12,64}$/i;

export interface DockerDiscoveryOptions {
  timeoutMs?: number;
  maxBufferBytes?: number;
  managedLabel?: string;
}

export class DockerContainerDiscovery {
  constructor(
    private readonly docker: DockerClient,
    private readonly binary = "docker",
    private readonly options: DockerDiscoveryOptions = {},
  ) {}

  async findByServerId(
    serverId: string,
  ): Promise<DockerContainerSnapshot | null> {
    if (!SERVER_ID_PATTERN.test(serverId)) {
      throw new Error("Invalid server ID.");
    }

    const ids = await this.listContainerIds(serverId);

    if (ids.length === 0) {
      return null;
    }

    if (ids.length > 1) {
      throw new Error(
        "Multiple Docker containers found for this server.",
      );
    }

    const container = await this.docker.inspectContainer(
      ids[0],
    );

    if (
      !container ||
      container.serverId !== serverId
    ) {
      throw new Error(
        "Docker container ownership verification failed.",
      );
    }

    return container;
  }

  private listContainerIds(
    serverId: string,
  ): Promise<string[]> {
    const managedLabel =
      this.options.managedLabel ??
      "matrixhost.managed";

    const timeoutMs =
      this.options.timeoutMs ?? 10_000;

    const maxBufferBytes =
      this.options.maxBufferBytes ?? 1024 * 1024;

    if (
      !/^[a-zA-Z0-9_.-]{1,128}$/.test(managedLabel)
    ) {
      return Promise.reject(
        new Error("Invalid Docker managed label."),
      );
    }

    return new Promise((resolve, reject) => {
      execFile(
        this.binary,
        [
          "ps",
          "--all",
          "--quiet",
          "--no-trunc",
          "--filter",
          `label=${managedLabel}=true`,
          "--filter",
          `label=matrixhost.server-id=${serverId}`,
        ],
        {
          timeout: timeoutMs,
          maxBuffer: maxBufferBytes,
          windowsHide: true,
          encoding: "utf8",
          shell: false,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(
              new Error(
                `Docker container discovery failed: ${
                  stderr.trim() || error.message
                }`,
              ),
            );

            return;
          }

          const ids = stdout
            .split(/\r?\n/)
            .map((id) => id.trim())
            .filter(Boolean);

          if (
            ids.some(
              (id) => !CONTAINER_ID_PATTERN.test(id),
            )
          ) {
            reject(
              new Error(
                "Docker returned an invalid container ID.",
              ),
            );

            return;
          }

          resolve(ids);
        },
      );
    });
  }
}
