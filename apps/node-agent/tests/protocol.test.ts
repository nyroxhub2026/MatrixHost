import assert from "node:assert/strict";
import test from "node:test";

import {
  agentIncomingMessageSchema,
  agentOutgoingMessageSchema,
} from "../src/protocol/message-schemas.js";

const nodeId = "8d4d6c68-7f63-4b67-9b25-8c1b9d2d8a31";
const jobId = "6b5a2f0d-1b35-4d91-9a74-5d0e6f7c8b90";
const serverId = "a1f4c0b2-3d6e-4a8b-9c1d-2e3f4a5b6c7d";

test("accepts the API connected handshake", () => {
  const result = agentIncomingMessageSchema.safeParse({
    type: "connected",
    nodeId,
    serverTime: new Date().toISOString(),
    protocolVersion: 1,
  });

  assert.equal(result.success, true);
});

test("accepts a lifecycle job with an empty payload", () => {
  const result = agentIncomingMessageSchema.safeParse({
    type: "job",
    job: {
      id: jobId,
      type: "START_SERVER",
      serverId,
      payload: {},
      attempt: 1,
    },
  });

  assert.equal(result.success, true);
});

test("rejects unknown job types and malformed UUIDs", () => {
  const result = agentIncomingMessageSchema.safeParse({
    type: "job",
    job: {
      id: "not-a-uuid",
      type: "RUN_HOST_COMMAND",
      serverId,
      payload: {},
      attempt: 1,
    },
  });

  assert.equal(result.success, false);
});

test("accepts success results and rejects failed results without an error", () => {
  const success = agentOutgoingMessageSchema.safeParse({
    type: "job_result",
    jobId,
    success: true,
    result: { serverId, operation: "START_SERVER" },
  });

  const failure = agentOutgoingMessageSchema.safeParse({
    type: "job_result",
    jobId,
    success: false,
  });

  assert.equal(success.success, true);
  assert.equal(failure.success, false);
});
