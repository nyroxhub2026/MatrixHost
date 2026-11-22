import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { DockerBackupManager } from "../src/docker/docker-backup-manager.js";

const serverId = "123e4567-e89b-42d3-a456-426614174000";
const backupId = "123e4567-e89b-42d3-a456-426614174001";
const containerId = "a".repeat(64);

test("rejects backup paths that can escape the configured storage directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "matrixhost-backup-"));
  try {
    const manager = new DockerBackupManager("docker", { directory });
    await assert.rejects(
      manager.restore(serverId, containerId, backupId, "../outside.tar", "a".repeat(64), 1024 * 1024),
      /Invalid backup storage path/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects mismatched backup identifiers and paths before Docker execution", async () => {
  const directory = await mkdtemp(join(tmpdir(), "matrixhost-backup-"));
  try {
    const manager = new DockerBackupManager("docker", { directory });
    await assert.rejects(
      manager.restore(serverId, containerId, backupId, `${serverId}/other.tar`, "a".repeat(64), 1024 * 1024),
      /does not match/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
