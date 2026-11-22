
import { execFile } from "node:child_process";

const COMMAND_TIMEOUT_MS = 30_000;
const MAX_BUFFER_BYTES = 1024 * 1024;

const SERVER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VOLUME_NAME_PATTERN =
  /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

interface DockerVolumeInspect {
  Name?: unknown;
  Labels?: unknown;
  Driver?: unknown;
  Mountpoint?: unknown;
}

export interface DockerVolumeInfo {
  name: string;
  serverId: string;
  driver: string;
  mountpoint: string;
}

export class DockerVolumeManager {
  constructor(
    private readonly binary = "docker",
  ) {}

  async create(
    volumeName: string,
    serverId: string,
  ): Promise<DockerVolumeInfo> {
    this.validate(volumeName, serverId);

    const existing = await this.inspect(volumeName);

    if (existing) {
      if (existing.serverId !== serverId) {
        throw new Error(
          "Docker volume ownership verification failed.",
        );
      }

      return existing;
    }

    await this.run([
      "volume",
      "create",
      "--label",
      "matrixhost.managed=true",
      "--label",
      `matrixhost.server-id=${serverId}`,
      volumeName,
    ]);

    const created = await this.inspect(volumeName);

    if (!created || created.serverId !== serverId) {
      throw new Error(
        "Docker volume creation could not be verified.",
      );
    }

    return created;
  }

  async inspect(
    volumeName: string,
  ): Promise<DockerVolumeInfo | null> {
    if (!VOLUME_NAME_PATTERN.test(volumeName)) {
      throw new Error("Invalid Docker volume name.");
    }

    let output: string;

    try {
      const result = await this.run([
        "volume",
        "inspect",
        volumeName,
      ]);

      output = result.stdout;
    } catch {
      return null;
    }

    let parsed: DockerVolumeInspect[];

    try {
      parsed = JSON.parse(output) as DockerVolumeInspect[];
    } catch {
      throw new Error(
        "Docker returned invalid volume data.",
      );
    }

    const volume = parsed[0];

    if (!volume) {
      return null;
    }

    const labels = volume.Labels;

    if (
      typeof volume.Name !== "string" ||
      typeof volume.Driver !== "string" ||
      typeof volume.Mountpoint !== "string" ||
      labels === null ||
      typeof labels !== "object" ||
      Array.isArray(labels)
    ) {
      throw new Error(
        "Docker returned incomplete volume data.",
      );
    }

    const labelMap = labels as Record<string, unknown>;

    const managed = labelMap["matrixhost.managed"];
    const serverId = labelMap["matrixhost.server-id"];

    if (
      managed !== "true" ||
      typeof serverId !== "string" ||
      !SERVER_ID_PATTERN.test(serverId)
    ) {
      throw new Error(
        "Volume is not managed by MatrixHost.",
      );
    }

    return {
      name: volume.Name,
      serverId,
      driver: volume.Driver,
      mountpoint: volume.Mountpoint,
    };
  }

  async remove(
    volumeName: string,
    expectedServerId: string,
  ): Promise<void> {
    this.validate(volumeName, expectedServerId);

    const volume = await this.inspect(volumeName);

    if (!volume) {
      return;
    }

    if (volume.serverId !== expectedServerId) {
      throw new Error(
        "Docker volume ownership verification failed.",
      );
    }

    await this.run([
      "volume",
      "rm",
      volumeName,
    ]);
  }

  private validate(
    volumeName: string,
    serverId: string,
  ): void {
    if (!VOLUME_NAME_PATTERN.test(volumeName)) {
      throw new Error("Invalid Docker volume name.");
    }

    if (!SERVER_ID_PATTERN.test(serverId)) {
      throw new Error("Invalid server ID.");
    }
  }

  private run(
    args: string[],
  ): Promise<{
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve, reject) => {
      execFile(
        this.binary,
        args,
        {
          timeout: COMMAND_TIMEOUT_MS,
          maxBuffer: MAX_BUFFER_BYTES,
          windowsHide: true,
          encoding: "utf8",
          shell: false,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(
              new Error(
                `Docker volume command failed: ${
                  stderr.trim() || error.message
                }`,
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
