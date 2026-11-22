import os from "node:os";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface MemoryInfo {
  total: number;
  free: number;
}

async function readLinuxMemoryInfo(): Promise<{
  memory: MemoryInfo;
  swap: MemoryInfo;
}> {
  const content = await fs.readFile(
    "/proc/meminfo",
    "utf8",
  );

  const values = new Map<string, number>();

  for (const line of content.split("\n")) {
    const match = /^([A-Za-z_()]+):\s+(\d+)\s+kB$/.exec(line);

    if (match) {
      values.set(match[1]!, Number(match[2]) * 1024);
    }
  }

  const memoryTotal = values.get("MemTotal") ?? os.totalmem();
  const memoryAvailable =
    values.get("MemAvailable") ??
    values.get("MemFree") ??
    os.freemem();

  const swapTotal = values.get("SwapTotal") ?? 0;
  const swapFree = values.get("SwapFree") ?? 0;

  return {
    memory: {
      total: memoryTotal,
      free: Math.min(memoryAvailable, memoryTotal),
    },
    swap: {
      total: swapTotal,
      free: Math.min(swapFree, swapTotal),
    },
  };
}

async function readMemoryInfo() {
  if (process.platform === "linux") {
    return readLinuxMemoryInfo();
  }

  const total = os.totalmem();
  const free = os.freemem();

  return {
    memory: {
      total,
      free: Math.min(free, total),
    },
    swap: {
      total: 0,
      free: 0,
    },
  };
}

async function readDiskInfo(): Promise<{
  total: number;
  free: number;
}> {
  const target = process.env.AGENT_STORAGE_PATH || "/";

  const stats = await fs.statfs(target);

  const total = stats.blocks * stats.bsize;
  const free = stats.bavail * stats.bsize;

  if (
    !Number.isSafeInteger(total) ||
    !Number.isSafeInteger(free)
  ) {
    throw new Error(
      "Disk capacity exceeds JavaScript safe integer range.",
    );
  }

  return {
    total,
    free: Math.min(free, total),
  };
}

async function readDockerVersion(): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      process.env.DOCKER_BINARY || "docker",
      ["version", "--format", "{{.Server.Version}}"],
      {
        timeout: 5000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        shell: false,
      },
    );

    const version = stdout.trim();

    if (!version || version.length > 64) {
      return "unavailable";
    }

    return version;
  } catch {
    return "unavailable";
  }
}

export interface HardwareSnapshot {
  hostname: string;
  operatingSystem: string;
  architecture: string;

  cpuModel: string;
  cpuCores: number;

  memoryTotalBytes: number;
  memoryFreeBytes: number;

  swapTotalBytes: number;
  swapFreeBytes: number;

  diskTotalBytes: number;
  diskFreeBytes: number;

  dockerVersion: string;
}

export async function collectHardwareSnapshot(): Promise<HardwareSnapshot> {
  const cpu = os.cpus();

  if (cpu.length === 0) {
    throw new Error("Unable to detect CPU information.");
  }

  const [memory, disk, dockerVersion] = await Promise.all([
    readMemoryInfo(),
    readDiskInfo(),
    readDockerVersion(),
  ]);

  const operatingSystem =
    `${os.type()} ${os.release()}`.slice(0, 128);

  return {
    hostname: os.hostname().slice(0, 253),
    operatingSystem,
    architecture: os.arch().slice(0, 64),

    cpuModel: cpu[0]!.model.trim().slice(0, 256),
    cpuCores: cpu.length,

    memoryTotalBytes: memory.memory.total,
    memoryFreeBytes: memory.memory.free,

    swapTotalBytes: memory.swap.total,
    swapFreeBytes: memory.swap.free,

    diskTotalBytes: disk.total,
    diskFreeBytes: disk.free,

    dockerVersion,
  };
}
