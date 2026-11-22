import { execFile } from "node:child_process";

const COMMAND_TIMEOUT_MS = 10_000;
const MAX_BUFFER_BYTES = 1024 * 1024;

export interface DockerContainerSnapshot {
  id: string;
  name: string;
  image: string;
  status: string;
  running: boolean;
  exitCode: number | null;
}

interface DockerInspectOutput {
  Id?: unknown;
  Name?: unknown;
  Config?: {
    Image?: unknown;
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
    if (!/^[a-f0-9]{12,64}$/i.test(containerId)) {
      throw new Error("Invalid Docker container ID.");
    }

    let output: string;

    try {
      const result = await this.run([
        "inspect",
        "--format",
        "{{json .}}",
        containerId,
      ]);

      output = result.stdout;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("No such object")
      ) {
        return null;
      }

      throw error;
    }

    let parsed: DockerInspectOutput;

    try {
      parsed = JSON.parse(output) as DockerInspectOutput;
    } catch {
      throw new Error("Docker returned invalid inspect data.");
    }

    const id = parsed.Id;
    const name = parsed.Name;
    const image = parsed.Config?.Image;
    const status = parsed.State?.Status;
    const running = parsed.State?.Running;
    const exitCode = parsed.State?.ExitCode;

    if (
      typeof id !== "string" ||
      typeof name !== "string" ||
      typeof image !== "string" ||
      typeof status !== "string" ||
      typeof running !== "boolean"
    ) {
      throw new Error("Docker returned incomplete container data.");
    }

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
    };
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

          resolve({
            stdout,
            stderr,
          });
        },
      );
    });
  }
}
