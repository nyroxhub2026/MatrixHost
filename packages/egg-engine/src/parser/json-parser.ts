import { z } from "zod";
import type {
  EggParseResult,
  PterodactylEgg
} from "./egg-format.js";

const eggVariableSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  env_variable: z.string().min(1),
  default_value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null()
  ]).optional(),
  user_viewable: z.boolean().optional(),
  user_editable: z.boolean().optional(),
  rules: z.string().optional(),
  field_type: z.string().optional()
});

const eggSchema = z.object({
  _comment: z.string().optional(),
  meta: z.object({
    version: z.string().optional(),
    update_url: z.string().nullable().optional()
  }).optional(),
  name: z.string().min(1),
  author: z.string().optional(),
  description: z.string().optional(),
  features: z.array(z.string()).optional(),
  docker_images: z.record(z.string(), z.string()).optional(),
  file_denylist: z.array(z.string()).optional(),
  startup: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
  scripts: z.record(z.string(), z.unknown()).optional(),
  variables: z.array(eggVariableSchema).optional()
});

export function parseEggJson(input: string): EggParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    return {
      success: false,
      errors: ["The supplied content is not valid JSON."],
      warnings: []
    };
  }

  const result = eggSchema.safeParse(parsed);

  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues.map((issue) => {
        const path = issue.path.join(".");
        return `${path || "egg"}: ${issue.message}`;
      }),
      warnings: []
    };
  }

  return {
    success: true,
    egg: result.data as PterodactylEgg,
    errors: [],
    warnings: []
  };
}
