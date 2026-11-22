import { z } from "zod";

const agentServerStatusSchema = z
  .object({
    serverId: z.uuid(),
    containerId: z.string().regex(/^[a-f0-9]{12,64}$/i),
    status: z.enum([
      "running",
      "created",
      "exited",
      "restarting",
      "dead",
      "paused",
      "removing",
      "unknown",
    ]),
    exitCode: z.number().int().nullable(),
  })
  .strict();

export const agentHeartbeatSchema = z
  .object({
    servers: z.array(agentServerStatusSchema).max(100).default([]),
    agentVersion: z.string().trim().min(1).max(64),
    dockerVersion: z.string().trim().min(1).max(64),

    hostname: z.string().trim().min(1).max(253),
    operatingSystem: z.string().trim().min(1).max(128),
    architecture: z.string().trim().min(1).max(64),

    cpuModel: z.string().trim().min(1).max(256),
    cpuCores: z.number().int().positive().max(4096),

    memoryTotalBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    memoryFreeBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),

    swapTotalBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    swapFreeBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),

    diskTotalBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    diskFreeBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .refine(
    (data) =>
      data.memoryFreeBytes <= data.memoryTotalBytes &&
      data.swapFreeBytes <= data.swapTotalBytes &&
      data.diskFreeBytes <= data.diskTotalBytes,
    "Free resources cannot exceed total resources."
  );

export type AgentHeartbeatInput = z.infer<
  typeof agentHeartbeatSchema
>;
