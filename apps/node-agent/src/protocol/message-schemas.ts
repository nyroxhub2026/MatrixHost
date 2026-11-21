import { z } from "zod";

const uuidSchema = z.uuid();

export const connectedMessageSchema = z
  .object({
    type: z.literal("connected"),
    nodeId: uuidSchema,
    serverTime: z.iso.datetime(),
    protocolVersion: z.number().int().positive(),
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
        payload: z.record(z.string(), z.unknown()),
        attempt: z.number().int().positive(),
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
    result: z
      .record(z.string(), z.unknown())
      .optional(),
    error: z
      .object({
        code: z.string().min(1).max(64),
        message: z.string().min(1).max(500),
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
  );

export const agentWebSocketMessageSchema = z.discriminatedUnion(
  "type",
  [
    connectedMessageSchema,
    pingMessageSchema,
    pongMessageSchema,
    jobMessageSchema,
    jobAckMessageSchema,
    jobResultMessageSchema,
  ],
);

export type ValidatedAgentWebSocketMessage = z.infer<
  typeof agentWebSocketMessageSchema
>;
