import { z } from "zod";

export const agentJobTypeSchema = z.enum([
  "CREATE_SERVER", "START_SERVER", "STOP_SERVER", "RESTART_SERVER",
  "KILL_SERVER", "DELETE_SERVER", "CREATE_BACKUP", "RESTORE_BACKUP",
]);

const environmentSchema = z.record(
  z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
  z.string().max(4096),
).refine((environment) => Object.keys(environment).length <= 100, "Too many environment variables.");

const resourceLimitsSchema = z.object({
  memoryBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  swapBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  diskBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  cpuPercent: z.number().positive().max(100000),
}).strict();

const portBindingSchema = z.object({
  hostIp: z.string().min(2).max(45),
  hostPort: z.number().int().min(1).max(65535),
  containerPort: z.number().int().min(1).max(65535),
  protocol: z.enum(["tcp", "udp"]),
}).strict();

export const createServerJobPayloadSchema = z.object({
  image: z.string().min(1).max(255),
  startup: z.string().min(1).max(16384),
  environment: environmentSchema,
  limits: resourceLimitsSchema,
  ports: z.array(portBindingSchema).min(1).max(100),
  install: z.object({
    image: z.string().min(1).max(255),
    entrypoint: z.string().min(1).max(200).optional(),
    script: z.string().min(1).max(256 * 1024),
    environment: environmentSchema,
  }).strict().optional(),
}).strict();

export const createBackupJobPayloadSchema = z.object({
  backupId: z.uuid(),
  maxBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict();

export const restoreBackupJobPayloadSchema = z.object({
  backupId: z.uuid(),
  storagePath: z.string().min(1).max(256),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();

export const lifecycleJobPayloadSchema = z.object({}).strict();

export const agentJobSchema = z.object({
  id: z.uuid(),
  type: agentJobTypeSchema,
  serverId: z.uuid(),
  payload: z.record(z.string(), z.unknown()),
  attempt: z.number().int().positive().max(100),
}).strict().superRefine((job, context) => {
  const result = job.type === "CREATE_SERVER"
    ? createServerJobPayloadSchema.safeParse(job.payload)
    : job.type === "CREATE_BACKUP"
      ? createBackupJobPayloadSchema.safeParse(job.payload)
      : job.type === "RESTORE_BACKUP"
        ? restoreBackupJobPayloadSchema.safeParse(job.payload)
        : lifecycleJobPayloadSchema.safeParse(job.payload);

  if (!result.success) {
    context.addIssue({ code: "custom", path: ["payload"], message: "Invalid job payload." });
  }
});

export type ValidatedAgentJob = z.infer<typeof agentJobSchema>;
