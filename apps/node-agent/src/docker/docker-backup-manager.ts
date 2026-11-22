import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, rename, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTAINER_PATTERN = /^[a-f0-9]{12,64}$/i;
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/i;
const MAX_BACKUP_BYTES = 20 * 1024 * 1024 * 1024;

export interface DockerBackupManagerOptions {
  directory?: string;
  timeoutMs?: number;
  maxBackupBytes?: number;
}

export interface BackupResult {
  storagePath: string;
  checksum: string;
  sizeBytes: number;
}

export class DockerBackupManager {
  private readonly directory: string;
  private readonly timeoutMs: number;
  private readonly maxBackupBytes: number;

  constructor(
    private readonly dockerBinary = "docker",
    options: DockerBackupManagerOptions = {},
  ) {
    this.directory = resolve(options.directory ?? "/var/lib/matrixhost/backups");
    this.timeoutMs = options.timeoutMs ?? 60 * 60 * 1000;
    this.maxBackupBytes = options.maxBackupBytes ?? MAX_BACKUP_BYTES;

    if (
      !isAbsolute(this.directory) ||
      !Number.isInteger(this.timeoutMs) ||
      this.timeoutMs < 30_000 ||
      this.timeoutMs > 6 * 60 * 60 * 1000 ||
      !Number.isSafeInteger(this.maxBackupBytes) ||
      this.maxBackupBytes < 1024 * 1024 ||
      this.maxBackupBytes > MAX_BACKUP_BYTES
    ) {
      throw new Error("Invalid backup storage configuration.");
    }
  }

  async create(
    serverId: string,
    containerId: string,
    backupId: string,
    diskLimitBytes: number,
    signal?: AbortSignal,
  ): Promise<BackupResult> {
    this.validateIds(serverId, containerId, backupId);
    if (!Number.isSafeInteger(diskLimitBytes) || diskLimitBytes <= 0) {
      throw new Error("Invalid server disk limit.");
    }

    const relativePath = join(serverId, `${backupId}.tar`);
    const destination = this.resolveStoragePath(relativePath);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    const directory = dirname(destination);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);

    const hash = createHash("sha256");
    let sizeBytes = 0;
    const meter = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        sizeBytes += chunk.length;
        if (sizeBytes > Math.min(diskLimitBytes, this.maxBackupBytes)) {
          callback(new Error("Backup exceeds the configured backup size limit."));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    const child = spawn(this.dockerBinary, [
      "cp", "-a", `${containerId}:/home/container/.`, "-",
    ], { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-8192);
    });

    const timeout = setTimeout(() => child.kill("SIGKILL"), this.timeoutMs);
    const abort = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", abort, { once: true });

    const childExit = new Promise<number | null>((resolveExit, reject) => {
      child.once("error", reject);
      child.once("close", resolveExit);
    });

    try {
      await pipeline(child.stdout, meter, createWriteStream(temporary, { flags: "wx", mode: 0o600 }), { signal });
      const exitCode = await childExit;
      if (signal?.aborted) throw new Error("Backup was cancelled.");
      if (exitCode !== 0) throw new Error(`Docker backup archive failed: ${stderr.trim() || "tar exited unsuccessfully"}`);
      await rename(temporary, destination);
      return {
        storagePath: relativePath.split(sep).join("/"),
        checksum: hash.digest("hex"),
        sizeBytes,
      };
    } catch (error) {
      child.kill("SIGKILL");
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  async restore(
    serverId: string,
    containerId: string,
    backupId: string,
    storagePath: string,
    expectedChecksum: string,
    maxBytes: number,
    signal?: AbortSignal,
  ): Promise<{ restored: true; checksum: string; sizeBytes: number }> {
    this.validateIds(serverId, containerId, backupId);
    if (!CHECKSUM_PATTERN.test(expectedChecksum) || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      throw new Error("Invalid backup checksum.");
    }

    const expectedPath = `${serverId}/${backupId}.tar`;
    if (storagePath !== expectedPath) {
      throw new Error("Backup storage path does not match its server and backup identifiers.");
    }

    const source = this.resolveStoragePath(storagePath);
    const metadata = await stat(source);
    if (!metadata.isFile() || metadata.size <= 0 || metadata.size > Math.min(this.maxBackupBytes, maxBytes)) {
      throw new Error("Backup archive is missing or exceeds the configured size limit.");
    }

    const hash = createHash("sha256");
    for await (const chunk of createReadStream(source)) {
      if (signal?.aborted) throw new Error("Restore was cancelled.");
      hash.update(chunk as Buffer);
    }
    const actualChecksum = hash.digest("hex");
    if (actualChecksum !== expectedChecksum) {
      throw new Error("Backup checksum verification failed; restore was refused.");
    }

    const child = spawn(this.dockerBinary, [
      "cp", "-a", "-", `${containerId}:/home/container`,
    ], { shell: false, windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-8192);
    });

    const timeout = setTimeout(() => child.kill("SIGKILL"), this.timeoutMs);
    const abort = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", abort, { once: true });

    const childExit = new Promise<number | null>((resolveExit, reject) => {
      child.once("error", reject);
      child.once("close", resolveExit);
    });

    try {
      await pipeline(createReadStream(source), child.stdin, { signal });
      const exitCode = await childExit;
      if (signal?.aborted) throw new Error("Restore was cancelled.");
      if (exitCode !== 0) throw new Error(`Docker restore archive failed: ${stderr.trim() || "tar exited unsuccessfully"}`);
      return { restored: true, checksum: actualChecksum, sizeBytes: metadata.size };
    } catch (error) {
      child.kill("SIGKILL");
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  private resolveStoragePath(storagePath: string): string {
    if (
      typeof storagePath !== "string" ||
      storagePath.length > 256 ||
      storagePath.startsWith("/") ||
      storagePath.includes("\\") ||
      storagePath.split("/").some((part) => !part || part === "." || part === "..")
    ) {
      throw new Error("Invalid backup storage path.");
    }
    const result = resolve(this.directory, storagePath);
    if (!result.startsWith(this.directory + sep)) {
      throw new Error("Backup path escapes the configured storage directory.");
    }
    return result;
  }

  private validateIds(serverId: string, containerId: string, backupId: string): void {
    if (!UUID_PATTERN.test(serverId) || !UUID_PATTERN.test(backupId) || !CONTAINER_PATTERN.test(containerId)) {
      throw new Error("Invalid backup target.");
    }
  }
}
