import { createHash, randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";

import type { ChildProcessWithoutNullStreams } from "node:child_process";

const SERVER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTAINER_ID_PATTERN = /^[a-f0-9]{12,64}$/i;
const RESOURCE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const IMAGE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,254}$/;
const ENTRYPOINT_PATTERN = /^(?:\/[a-zA-Z0-9_./-]{1,200}|[a-zA-Z0-9_.-]{1,64})$/;
const MAX_INSTALL_SCRIPT_BYTES = 256 * 1024;
const MAX_INSTALL_OUTPUT_BYTES = 256 * 1024;

export interface DockerInstallerLimits {
  memoryBytes: number;
  cpuPercent: number;
  diskBytes: number;
  pidsLimit: number;
}

export interface DockerInstallerOptions {
  serverId: string;
  targetContainerId: string;
  networkName: string;
  image: string;
  entrypoint?: string;
  script: string;
  environment: Record<string, string>;
  limits: DockerInstallerLimits;
}

export interface DockerInstallerRunnerOptions {
  timeoutMs?: number;
  maxBufferBytes?: number;
  managedLabel?: string;
  allowedImagePrefixes?: string[];
}

export class DockerInstallerRunner {
  private readonly timeoutMs: number;
  private readonly maxBufferBytes: number;
  private readonly managedLabel: string;
  private readonly allowedImagePrefixes: string[];

  constructor(
    private readonly binary = "docker",
    options: DockerInstallerRunnerOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
    this.maxBufferBytes = options.maxBufferBytes ?? 1024 * 1024;
    this.managedLabel = options.managedLabel ?? "matrixhost.managed";
    this.allowedImagePrefixes = options.allowedImagePrefixes ?? [];

    if (
      !Number.isInteger(this.timeoutMs) ||
      this.timeoutMs < 30_000 ||
      this.timeoutMs > 60 * 60 * 1000 ||
      !Number.isInteger(this.maxBufferBytes) ||
      this.maxBufferBytes < 65_536 ||
      this.maxBufferBytes > 16 * 1024 * 1024 ||
      !/^[a-zA-Z0-9_.-]{1,128}$/.test(this.managedLabel) ||
      this.allowedImagePrefixes.length === 0 ||
      this.allowedImagePrefixes.length > 50
    ) {
      throw new Error("Invalid Docker installer configuration.");
    }
  }

  async isInstalled(
    targetContainerId: string,
    serverId: string,
    installHash: string,
  ): Promise<boolean> {
    this.validateTarget(targetContainerId, serverId);

    const result = await this.run([
      "exec",
      targetContainerId,
      "/bin/sh",
      "-lc",
      "cat /home/container/.matrixhost-install-complete 2>/dev/null || true",
    ]);

    return result.stdout.trim() === installHash;
  }

  async install(
    options: DockerInstallerOptions,
    signal?: AbortSignal,
  ): Promise<{ installHash: string }> {
    this.validate(options);

    const installHash = createHash("sha256")
      .update(JSON.stringify({
        image: options.image,
        entrypoint: options.entrypoint ?? "/bin/bash",
        script: options.script,
        environment: Object.fromEntries(
          Object.entries(options.environment).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        ),
      }))
      .digest("hex");

    if (await this.isInstalled(
      options.targetContainerId,
      options.serverId,
      installHash,
    )) {
      return { installHash };
    }

    const installerName =
      `matrixhost-installer-${options.serverId}-${randomUUID().slice(0, 8)}`;
    let installerContainerId: string | undefined;

    try {
      const created = await this.run([
        "create",
        "--name",
        installerName,
        "--label",
        `${this.managedLabel}=true`,
        "--label",
        "matrixhost.installer=true",
        "--label",
        `matrixhost.server-id=${options.serverId}`,
        "--memory",
        String(options.limits.memoryBytes),
        "--cpus",
        String(options.limits.cpuPercent / 100),
        "--pids-limit",
        String(options.limits.pidsLimit),
        "--storage-opt",
        `size=${options.limits.diskBytes}B`,
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges:true",
        "--network",
        options.networkName,
        "--entrypoint",
        "/bin/sh",
        options.image,
        "-lc",
        "while :; do sleep 3600; done",
      ], signal);

      installerContainerId = created.stdout.trim();

      if (!CONTAINER_ID_PATTERN.test(installerContainerId)) {
        throw new Error("Docker returned an invalid installer container ID.");
      }

      await this.run(["start", installerContainerId], signal);
      await this.run([
        "exec",
        options.targetContainerId,
        "/bin/sh",
        "-lc",
        "mkdir -p /home/container && rm -f /home/container/.matrixhost-install-complete",
      ], signal);
      await this.run([
        "exec",
        installerContainerId,
        "/bin/sh",
        "-lc",
        "mkdir -p /mnt/server",
      ], signal);

      const entrypoint = options.entrypoint ?? "/bin/bash";
      const execArgs = [
        "exec",
        "-i",
        "--workdir",
        "/mnt/server",
      ];

      for (const [key, value] of Object.entries(options.environment)) {
        execArgs.push("--env", `${key}=${value}`);
      }

      execArgs.push(
        "--env",
        "SERVER_LOCATION=/mnt/server",
        installerContainerId,
        entrypoint,
        "-s",
      );

      await this.runWithInput(
        execArgs,
        Buffer.from(options.script, "utf8"),
        signal,
      );

      await this.copyInstallerFiles(
        installerContainerId,
        options.targetContainerId,
        options.limits.diskBytes,
        signal,
      );

      await this.run([
        "exec",
        options.targetContainerId,
        "/bin/sh",
        "-lc",
        `printf '%s' '${installHash}' > /home/container/.matrixhost-install-complete`,
      ], signal);

      return { installHash };
    } finally {
      if (installerContainerId) {
        try {
          await this.run(["rm", "--force", installerContainerId]);
        } catch {
          // The installer container is disposable; retain the original error.
        }
      }
    }
  }

  private validate(options: DockerInstallerOptions): void {
    this.validateTarget(options.targetContainerId, options.serverId);

    if (
      !RESOURCE_NAME_PATTERN.test(options.networkName) ||
      !IMAGE_PATTERN.test(options.image) ||
      !this.allowedImagePrefixes.some((prefix) =>
        options.image.startsWith(prefix),
      )
    ) {
      throw new Error("Installer image or network is not allowed.");
    }

    const entrypoint = options.entrypoint ?? "/bin/bash";

    if (!ENTRYPOINT_PATTERN.test(entrypoint)) {
      throw new Error("Invalid installer entrypoint.");
    }

    if (
      typeof options.script !== "string" ||
      options.script.trim().length === 0 ||
      Buffer.byteLength(options.script, "utf8") > MAX_INSTALL_SCRIPT_BYTES ||
      options.script.includes("\0")
    ) {
      throw new Error("Invalid or oversized Egg installation script.");
    }

    if (
      options.environment === null ||
      typeof options.environment !== "object" ||
      Array.isArray(options.environment) ||
      Object.keys(options.environment).length > 100
    ) {
      throw new Error("Invalid installer environment.");
    }

    for (const [key, value] of Object.entries(options.environment)) {
      if (
        !/^[A-Z_][A-Z0-9_]*$/.test(key) ||
        typeof value !== "string" ||
        value.length > 4096 ||
        value.includes("\0")
      ) {
        throw new Error("Invalid installer environment variable.");
      }
    }

    const limits = options.limits;

    if (
      !Number.isSafeInteger(limits.memoryBytes) ||
      limits.memoryBytes <= 0 ||
      !Number.isFinite(limits.cpuPercent) ||
      limits.cpuPercent <= 0 ||
      limits.cpuPercent > 100_000 ||
      !Number.isSafeInteger(limits.diskBytes) ||
      limits.diskBytes <= 0 ||
      !Number.isInteger(limits.pidsLimit) ||
      limits.pidsLimit < 64 ||
      limits.pidsLimit > 100_000
    ) {
      throw new Error("Invalid installer resource limits.");
    }
  }

  private validateTarget(
    targetContainerId: string,
    serverId: string,
  ): void {
    if (
      !CONTAINER_ID_PATTERN.test(targetContainerId) ||
      !SERVER_ID_PATTERN.test(serverId)
    ) {
      throw new Error("Invalid installer target.");
    }
  }

  private async copyInstallerFiles(
    installerContainerId: string,
    targetContainerId: string,
    maxBytes: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const source = spawn(
      this.binary,
      [
        "exec",
        installerContainerId,
        "tar",
        "-C",
        "/mnt/server",
        "-cf",
        "-",
        ".",
      ],
      { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );

    const destination = spawn(
      this.binary,
      [
        "exec",
        "-i",
        targetContainerId,
        "tar",
        "-C",
        "/home/container",
        "-xf",
        "-",
      ],
      { shell: false, windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
    );

    let transferredBytes = 0;
    let sourceError = "";
    let destinationError = "";
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      if (error) {
        source.kill("SIGKILL");
        destination.kill("SIGKILL");
      }
      if (error) rejectPromise(error);
    };

    let resolvePromise!: () => void;
    let rejectPromise!: (error: Error) => void;

    const completion = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const abort = () => finish(new Error("Egg installation was cancelled."));
    signal?.addEventListener("abort", abort, { once: true });

    timeout = setTimeout(
      () => finish(new Error("Egg installer file transfer timed out.")),
      this.timeoutMs,
    );

    source.stderr.setEncoding("utf8");
    destination.stderr.setEncoding("utf8");
    source.stderr.on("data", (chunk: string) => {
      sourceError = (sourceError + chunk).slice(-16_384);
    });
    destination.stderr.on("data", (chunk: string) => {
      destinationError = (destinationError + chunk).slice(-16_384);
    });

    source.stdout.on("data", (chunk: Buffer) => {
      transferredBytes += chunk.length;

      if (transferredBytes > maxBytes) {
        finish(new Error("Installer output exceeds the server disk quota."));
      }
    });

    source.on("error", (error) => finish(error));
    destination.on("error", (error) => finish(error));

    source.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          `Could not read installer output: ${sourceError.trim() || "tar failed"}`,
        ));
      }
    });

    destination.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          `Could not write installer output: ${destinationError.trim() || "tar failed"}`,
        ));
      }
    });

    source.stdout.pipe(destination.stdin);

    let sourceClosed = false;
    let destinationClosed = false;

    source.on("close", () => {
      sourceClosed = true;
      if (sourceClosed && destinationClosed && !settled) {
        settled = true;
        if (timeout) clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        resolvePromise();
      }
    });

    destination.on("close", () => {
      destinationClosed = true;
      if (sourceClosed && destinationClosed && !settled) {
        settled = true;
        if (timeout) clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        resolvePromise();
      }
    });

    await completion;
  }

  private runWithInput(
    args: string[],
    input: Buffer,
    signal?: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binary, args, {
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let outputBytes = 0;
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        if (error) {
          child.kill("SIGKILL");
          reject(error);
        }
      };

      const abort = () => finish(new Error("Egg installation was cancelled."));
      const timeout = setTimeout(
        () => finish(new Error("Egg installer execution timed out.")),
        this.timeoutMs,
      );

      signal?.addEventListener("abort", abort, { once: true });

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        outputBytes += Buffer.byteLength(chunk, "utf8");
        if (outputBytes > MAX_INSTALL_OUTPUT_BYTES) {
          finish(new Error("Egg installer produced too much output."));
          return;
        }
        stdout = (stdout + chunk).slice(-MAX_INSTALL_OUTPUT_BYTES);
      });
      child.stderr.on("data", (chunk: string) => {
        outputBytes += Buffer.byteLength(chunk, "utf8");
        if (outputBytes > MAX_INSTALL_OUTPUT_BYTES) {
          finish(new Error("Egg installer produced too much output."));
          return;
        }
        stderr = (stderr + chunk).slice(-MAX_INSTALL_OUTPUT_BYTES);
      });
      child.on("error", (error) => finish(error));
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);

        if (code !== 0) {
          reject(new Error(
            `Egg installer failed (exit ${String(code)}): ${stderr.trim() || stdout.trim() || "no output"}`,
          ));
          return;
        }

        resolve();
      });

      child.stdin.on("error", (error) => finish(error));
      child.stdin.end(input);
    });
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
            reject(new Error(
              `Docker installer command failed: ${stderr.trim() || error.message}`,
            ));
            return;
          }

          resolve({ stdout, stderr });
        },
      );
    });
  }
}
