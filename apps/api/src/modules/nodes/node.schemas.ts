import { z } from "zod";

const nodeNameSchema = z
  .string()
  .trim()
  .min(3, "Node name must contain at least 3 characters.")
  .max(64, "Node name cannot exceed 64 characters.");

const hostnameSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(
    /^[a-zA-Z0-9.-]+$/,
    "Invalid hostname."
  );

const portSchema = z
  .number()
  .int()
  .min(1)
  .max(65535);

const resourceCapacitySchema = z
  .object({
    cpuAllocatable: z.number().positive().max(4096),
    memoryAllocatableBytes: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER),
    swapAllocatableBytes: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER),
    diskAllocatableBytes: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const createNodeSchema = z
  .object({
    name: nodeNameSchema,
    fqdn: hostnameSchema,
    scheme: z.enum(["http", "https"]).default("https"),
    port: portSchema.default(8443),
    resources: resourceCapacitySchema,
  })
  .strict();

export const updateNodeSchema = z
  .object({
    name: nodeNameSchema.optional(),
    fqdn: hostnameSchema.optional(),
    scheme: z.enum(["http", "https"]).optional(),
    port: portSchema.optional(),
    resources: resourceCapacitySchema.optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one field must be provided."
  );

export const nodeParamsSchema = z
  .object({
    nodeId: z.uuid(),
  })
  .strict();

export type CreateNodeInput = z.infer<
  typeof createNodeSchema
>;

export type UpdateNodeInput = z.infer<
  typeof updateNodeSchema
>;
