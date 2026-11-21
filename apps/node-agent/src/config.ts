import { z } from "zod";

const configSchema = z.object({
  NODE_ID: z.string().uuid(),

  API_BASE_URL: z.string().url(),

  AGENT_TOKEN: z.string().min(32).max(256),

  AGENT_VERSION: z.string().min(1).max(64).default("1.0.0"),

  HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(5000)
    .max(120000)
    .default(15000),

  RECONNECT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60000)
    .default(5000),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug"])
    .default("info"),

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("production"),
}).strict().superRefine((config, context) => {
  const url = new URL(config.API_BASE_URL);

  if (
    config.NODE_ENV === "production" &&
    url.protocol !== "https:"
  ) {
    context.addIssue({
      code: "custom",
      path: ["API_BASE_URL"],
      message: "Production API_BASE_URL must use HTTPS.",
    });
  }

  if (
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    context.addIssue({
      code: "custom",
      path: ["API_BASE_URL"],
      message: "API_BASE_URL must not contain credentials.",
    });
  }
});

export type AgentConfig = z.infer<typeof configSchema>;

export function loadAgentConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AgentConfig {
  const parsed = configSchema.safeParse(environment);

  if (!parsed.success) {
    throw new Error(
      `Invalid Node Agent configuration: ${z.prettifyError(parsed.error)}`,
    );
  }

  return parsed.data;
}
