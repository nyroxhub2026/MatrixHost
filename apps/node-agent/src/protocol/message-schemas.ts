import { z } from "zod";

const uuidSchema = z.uuid();

const safeRecordSchema = z
  .record(z.string().min(1).max(128), z.unknown())
  .refine(
    (record) => Object.keys(record).length <= 100,
    "Too many object properties.",
  );

export const connectedMessageSchema = z
  .object({
    type: z.literal("connected"),
    nodeId: uuidSchema,
    serverTime: z.iso.datetime(),
    protocolVersion: z.literal(1),
  })
  .strict();

export const pingMessageSchema = z
  .object({
    type: z.literal("ping"),
    timestamp: z.iso.datetime(),
  })
  .strict();

export const pongMessageSchema = z
  .object({
    type: z.literal("pong"),
    timestamp: z.iso.datetime(),
  })
  .strict();

export const jobMessageSchema = z
  .object({
    type: z.literal("job"),
    job: z
      .object({
        id: uuidSchema,
        type: z.enum([
          "CREATE_SERVER",
          "START_SERVER",
          "STOP_SERVER",
          "RESTART_SERVER",
          "KILL_SERVER",
          "DELETE_SERVER",
        ]),
        serverId: uuidSchema,
        payload: safeRecordSchema,
        attempt: z.number().int().positive().max(100),
      })
      .strict(),
  })
  .strict();

export const jobAckMessageSchema = z
  .object({
    type: z.literal("job_ack"),
    jobId: uuidSchema,
    accepted: z.boolean(),
  })
  .strict();

export const jobResultMessageSchema = z
  .object({
    type: z.literal("job_result"),
    jobId: uuidSchema,
    success: z.boolean(),
    result: safeRecordSchema.optional(),
    error: z
      .object({
        code: z.string().min(1).max(100),
        message: z.string().min(1).max(1000),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (message) =>
      message.success
        ? message.error === undefined
        : message.error !== undefined,
    "A failed job result must include an error.",
  )
  .refine(
    (message) =>
      message.success
        ? message.result !== undefined
        : message.result === undefined,
    "A successful job result must include a result and a failed result must not include one.",
  );

export const agentIncomingMessageSchema =
  z.discriminatedUnion("type", [
    connectedMessageSchema,
    pingMessageSchema,
    pongMessageSchema,
    jobMessageSchema,
  ]);

export const agentOutgoingMessageSchema =
  z.discriminatedUnion("type", [
    pongMessageSchema,
    jobAckMessageSchema,
    jobResultMessageSchema,
  ]);

export const agentWebSocketMessageSchema =
  z.discriminatedUnion("type", [
    connectedMessageSchema,
    pingMessageSchema,
    pongMessageSchema,
    jobMessageSchema,
    jobAckMessageSchema,
    jobResultMessageSchema,
  ]);

export type ValidatedAgentWebSocketMessage = z.infer<
  typeof agentWebSocketMessageSchema
>;

export type AgentIncomingMessage = z.infer<
  typeof agentIncomingMessageSchema
>;

export type AgentOutgoingMessage = z.infer<
  typeof agentOutgoingMessageSchema
>;
