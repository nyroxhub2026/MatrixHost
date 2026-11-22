import { execFile } from "node:child_process";

const COMMAND_TIMEOUT_MS = 30_000;
const MAX_BUFFER_BYTES = 1024 * 1024;

const CONTAINER_ID_PATTERN =
  /^[a-f0-9]{12,64}$/i;

const SERVER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DockerContainerOperation =
  | "start"
  | "stop"
  | "restart"
  | "kill"
  | "remove";

export interface DockerContainerSnapshot {
  id: string;
  name: string;
  image: string;
  status: string;
  running: boolean;
  exitCode: number | null;
  serverId: string | null;
}

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

export class DockerClient {
  constructor(
    private readonly binary = "docker",
  ) {}

  async version(): Promise<string> {
    const output = await this.run([
      "version",
      "--format",
      "{{.Server.Version}}",
    ]);

    const version = output.stdout.trim();

    if (!version) {
      throw new Error("Docker Engine version is unavailable.");
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

    const result = await this.run([
      "inspect",
      "--format",
      "{{json .}}",
      containerId,
    ]);

    let parsed: DockerInspectOutput;

    try {
      parsed = JSON.parse(result.stdout) as DockerInspectOutput;
    } catch {
      throw new Error("Docker returned invalid inspect data.");
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
      typeof name !== "string" ||
      typeof image !== "string" ||
      typeof status !== "string" ||
      typeof running !== "boolean" ||
      labels === null ||
      typeof labels !== "object" ||
      Array.isArray(labels)
    ) {
      throw new Error("Docker returned incomplete container data.");
    }

    const serverId = (
      labels as Record<string, unknown>
    )["matrixhost.server-id"];

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
    };
  }

  async containerCommand(
    operation: DockerContainerOperation,
    containerId: string,
    expectedServerId: string,
  ): Promise<void> {
    this.validateContainerId(containerId);

    if (!SERVER_ID_PATTERN.test(expectedServerId)) {
      throw new Error("Invalid server ID.");
    }

    const container = await this.inspectContainer(containerId);

    if (!container || container.serverId !== expectedServerId) {
      throw new Error(
        "Docker container ownership verification failed.",
      );
    }

    const commands: Record<DockerContainerOperation, string> = {
      start: "start",
      stop: "stop",
      restart: "restart",
      kill: "kill",
      remove: "rm",
    };

    await this.run([
      commands[operation],
      containerId,
    ]);
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
                `Docker command failed: ${
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
