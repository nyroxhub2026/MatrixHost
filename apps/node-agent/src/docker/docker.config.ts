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
      .regex(/^[a-zA-Z0-9_./-]+$/, "Invalid Docker binary path.")
      .default("docker"),
    DOCKER_COMMAND_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
    DOCKER_MAX_BUFFER_BYTES: z.coerce.number().int().min(65536).max(16 * 1024 * 1024).default(1024 * 1024),
    DOCKER_REQUIRE_AVAILABLE: booleanSchema,
    DOCKER_DEFAULT_PIDS_LIMIT: z.coerce.number().int().min(64).max(100000).default(512),
    DOCKER_ALLOWED_IMAGE_PREFIXES: z.string().min(1).max(2048)
      .default("ghcr.io/pterodactyl/yolks:")
      .transform((value) => value.split(",").map((entry) => entry.trim()).filter(Boolean))
      .refine((prefixes) => prefixes.length > 0 && prefixes.length <= 50 && prefixes.every((prefix) => /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,254}$/.test(prefix)), "Invalid Docker image allowlist prefixes."),
    DOCKER_INSTALLER_TIMEOUT_MS: z.coerce.number().int().min(30000).max(3600000).default(900000),
    DOCKER_ALLOWED_INSTALLER_IMAGE_PREFIXES: z.string().min(1).max(2048)
      .default("ghcr.io/pterodactyl/installers:")
      .transform((value) => value.split(",").map((entry) => entry.trim()).filter(Boolean))
      .refine((prefixes) => prefixes.length > 0 && prefixes.length <= 50 && prefixes.every((prefix) => /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,254}$/.test(prefix)), "Invalid installer image allowlist prefixes."),
    DOCKER_BACKUP_DIRECTORY: z.string().min(1).max(512)
      .default("/var/lib/matrixhost/backups")
      .refine((value) => value.startsWith("/") && !value.includes("\0"), "Backup directory must be an absolute path."),
    DOCKER_BACKUP_TIMEOUT_MS: z.coerce.number().int().min(30000).max(21600000).default(3600000),
    DOCKER_BACKUP_MAX_BYTES: z.coerce.number().int().min(1048576).max(21474836480).default(21474836480),
    DOCKER_MANAGED_LABEL: z.string().regex(/^[a-zA-Z0-9_.-]{1,128}$/).default("matrixhost.managed"),
  })
  .strict();

export type DockerConfig = z.infer<typeof dockerConfigSchema>;

export function loadDockerConfig(env: NodeJS.ProcessEnv = process.env): DockerConfig {
  const result = dockerConfigSchema.safeParse({
    DOCKER_BINARY: env.DOCKER_BINARY,
    DOCKER_COMMAND_TIMEOUT_MS: env.DOCKER_COMMAND_TIMEOUT_MS,
    DOCKER_MAX_BUFFER_BYTES: env.DOCKER_MAX_BUFFER_BYTES,
    DOCKER_REQUIRE_AVAILABLE: env.DOCKER_REQUIRE_AVAILABLE,
    DOCKER_DEFAULT_PIDS_LIMIT: env.DOCKER_DEFAULT_PIDS_LIMIT,
    DOCKER_ALLOWED_IMAGE_PREFIXES: env.DOCKER_ALLOWED_IMAGE_PREFIXES,
    DOCKER_INSTALLER_TIMEOUT_MS: env.DOCKER_INSTALLER_TIMEOUT_MS,
    DOCKER_ALLOWED_INSTALLER_IMAGE_PREFIXES: env.DOCKER_ALLOWED_INSTALLER_IMAGE_PREFIXES,
    DOCKER_BACKUP_DIRECTORY: env.DOCKER_BACKUP_DIRECTORY,
    DOCKER_BACKUP_TIMEOUT_MS: env.DOCKER_BACKUP_TIMEOUT_MS,
    DOCKER_BACKUP_MAX_BYTES: env.DOCKER_BACKUP_MAX_BYTES,
    DOCKER_MANAGED_LABEL: env.DOCKER_MANAGED_LABEL,
  });

  if (!result.success) {
    throw new Error(`Invalid Docker configuration: ${result.error.message}`);
  }

  return result.data;
}
