import { z } from "zod";

const resourceSchema = z.object({
  memory: z.number().int().min(128).max(1048576),
  swap: z.number().int().min(0).max(1048576),
  disk: z.number().int().min(512).max(10485760),
  cpu: z.number().positive().max(256),
  ioWeight: z.number().int().min(10).max(1000),
  databases: z.number().int().min(0).max(100),
  allocations: z.number().int().min(1).max(100),
  backups: z.number().int().min(0).max(100)
}).strict();

export const createServerSchema = z.object({
  name: z.string().trim().min(3).max(64),
  description: z.string().trim().max(500).optional(),
  eggId: z.uuid(),
  nodeId: z.uuid().optional(),
  resources: resourceSchema,
  allocationId: z.uuid().optional(),
  environment: z.record(
    z.string().min(1).max(128),
    z.string().max(4096)
  ).default({})
}).strict();

export const updateServerSchema = z.object({
  name: z.string().trim().min(3).max(64).optional(),
  description: z.string().trim().max(500).nullable().optional()
}).strict();

export type CreateServerRequest = z.infer<typeof createServerSchema>;
export type UpdateServerRequest = z.infer<typeof updateServerSchema>;
