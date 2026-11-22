import assert from "node:assert/strict";
import test from "node:test";

import { JobManager } from "../src/jobs/job-manager.js";

const job = {
  id: "6b5a2f0d-1b35-4d91-9a74-5d0e6f7c8b90",
  type: "START_SERVER",
  serverId: "a1f4c0b2-3d6e-4a8b-9c1d-2e3f4a5b6c7d",
  payload: {},
  attempt: 1,
} as const;

test("does not execute a job before the caller can send its acknowledgement", async () => {
  const manager = new JobManager();
  let executed = false;

  manager.registerHandler("START_SERVER", {
    async execute() {
      executed = true;
      return { ok: true };
    },
  });

  const submission = manager.submit(job);

  assert.equal(submission.accepted, true);
  assert.equal(executed, false);

  const result = await submission.result;

  assert.equal(executed, true);
  assert.equal(result?.success, true);

  await manager.stop();
});

test("cancelling before execution prevents the handler from running", async () => {
  const manager = new JobManager();
  let executed = false;

  manager.registerHandler("START_SERVER", {
    async execute() {
      executed = true;
      return { ok: true };
    },
  });

  const submission = manager.submit(job);

  assert.equal(manager.cancel(job.id), true);

  const result = await submission.result;

  assert.equal(executed, false);
  assert.equal(result?.success, false);
  assert.equal(result?.error?.code, "JOB_ABORTED");

  await manager.stop();
});

test("re-delivery of a completed job returns its cached result without rerunning", async () => {
  const manager = new JobManager();
  let executions = 0;

  manager.registerHandler("START_SERVER", {
    async execute() {
      executions += 1;
      return { ok: true };
    },
  });

  const first = manager.submit(job);
  const firstResult = await first.result;
  const second = manager.submit(job);
  const secondResult = await second.result;

  assert.equal(firstResult?.success, true);
  assert.deepEqual(secondResult, firstResult);
  assert.equal(executions, 1);

  await manager.stop();
});
