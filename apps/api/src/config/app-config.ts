import { z } from "zod";

const appConfigSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  API_HOST: z.string().default("0.0.0.0"),

  API_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(3001),

  PANEL_URL: z.url().default("http://localhost:3000"),

  LOG_LEVEL: z
    .enum([
      "fatal",
      "error",
      "warn",
      "info",
      "debug",
      "trace",
      "silent",
    ])
    .default("info"),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export function loadAppConfig(
  environment: NodeJS.ProcessEnv = process.env
): AppConfig {
  const result = appConfigSchema.safeParse(environment);

  if (!result.success) {
    throw new Error(
      `Invalid API configuration: ${z.prettifyError(result.error)}`
    );
  }

  return result.data;
}

export const appConfig = loadAppConfig();
