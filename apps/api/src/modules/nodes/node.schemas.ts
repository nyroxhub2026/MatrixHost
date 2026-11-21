import { z } from "zod";

const nodeNameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64);

const addressSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(
    /^[a-zA-Z0-9.:[\]-]+$/,
    "Invalid network address."
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
    publicAddress: addressSchema,
    listenAddress: addressSchema.default("0.0.0.0"),
    listenPort: portSchema.default(8080),
    tlsEnabled: z.boolean().default(true),
    resources: resourceCapacitySchema,
  })
  .strict();

export const updateNodeSchema = z
  .object({
    name: nodeNameSchema.optional(),
    publicAddress: addressSchema.optional(),
    listenAddress: addressSchema.optional(),
    listenPort: portSchema.optional(),
    tlsEnabled: z.boolean().optional(),
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
