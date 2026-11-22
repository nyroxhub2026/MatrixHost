import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agentJobSchema,
  createBackupJobPayloadSchema,
  restoreBackupJobPayloadSchema,
} from "../src/jobs/job.schemas.js";

const jobId = "123e4567-e89b-42d3-a456-426614174000";
const serverId = "123e4567-e89b-42d3-a456-426614174001";
const backupId = "123e4567-e89b-42d3-a456-426614174002";

test("accepts bounded backup creation payload", () => {
  assert.equal(createBackupJobPayloadSchema.safeParse({ backupId, maxBytes: 1024 * 1024 }).success, true);
});

test("rejects unsafe backup storage paths", () => {
  assert.equal(restoreBackupJobPayloadSchema.safeParse({
    backupId,
    storagePath: "../outside.tar",
    checksum: "a".repeat(64),
  }).success, false);
});

test("accepts restore jobs only with a checksum and bounded path", () => {
  const result = agentJobSchema.safeParse({
    id: jobId,
    type: "RESTORE_BACKUP",
    serverId,
    payload: { backupId, storagePath: `${serverId}/${backupId}.tar`, checksum: "a".repeat(64) },
    attempt: 1,
  });
  assert.equal(result.success, true);
});

test("rejects restore jobs with invalid checksum", () => {
  const result = agentJobSchema.safeParse({
    id: jobId,
    type: "RESTORE_BACKUP",
    serverId,
    payload: { backupId, storagePath: `${serverId}/${backupId}.tar`, checksum: "invalid" },
    attempt: 1,
  });
  assert.equal(result.success, false);
});
