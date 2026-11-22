import { z } from "zod";

const booleanFromEnv = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const positiveIntegerFromEnv = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive());

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PANEL_URL: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:4000"),

  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: positiveIntegerFromEnv.default(4000),

  DATABASE_URL: z.string().min(1),

  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),

  CORS_ORIGINS: z.string().default("http://localhost:3000"),

  STORAGE_PATH: z.string().min(1).default("./storage"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  TRUST_PROXY: booleanFromEnv,

  COOKIE_SECURE: booleanFromEnv
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(
  input: Record<string, unknown>
): Environment {
  return environmentSchema.parse(input);
}

export function getEnvironmentErrors(
  input: Record<string, unknown>
): string[] {
  const result = environmentSchema.safeParse(input);

  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => {
    const path = issue.path.join(".");
    return `${path || "environment"}: ${issue.message}`;
  });
}
