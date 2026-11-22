import { z } from "zod";

const booleanSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const dockerConfigSchema = z
  .object({
    DOCKER_BINARY: z
      .string()
      .min(1)
      .max(255)
      .regex(
        /^[a-zA-Z0-9_./-]+$/,
        "Invalid Docker binary path.",
      )
      .default("docker"),

    DOCKER_COMMAND_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(120000)
      .default(30000),

    DOCKER_MAX_BUFFER_BYTES: z.coerce
      .number()
      .int()
      .min(65536)
      .max(16 * 1024 * 1024)
      .default(1024 * 1024),

    DOCKER_REQUIRE_AVAILABLE: booleanSchema,

    DOCKER_MANAGED_LABEL: z
      .string()
      .regex(/^[a-zA-Z0-9_.-]{1,128}$/)
      .default("matrixhost.managed"),
  })
  .strict();

export type DockerConfig = z.infer<
  typeof dockerConfigSchema
>;

export function loadDockerConfig(
  env: NodeJS.ProcessEnv = process.env,
): DockerConfig {
  const result = dockerConfigSchema.safeParse({
    DOCKER_BINARY: env.DOCKER_BINARY,
    DOCKER_COMMAND_TIMEOUT_MS:
      env.DOCKER_COMMAND_TIMEOUT_MS,
    DOCKER_MAX_BUFFER_BYTES:
      env.DOCKER_MAX_BUFFER_BYTES,
    DOCKER_REQUIRE_AVAILABLE:
      env.DOCKER_REQUIRE_AVAILABLE,
    DOCKER_MANAGED_LABEL:
      env.DOCKER_MANAGED_LABEL,
  });

  if (!result.success) {
    throw new Error(
      `Invalid Docker configuration: ${result.error.message}`,
    );
  }

  return result.data;
}
