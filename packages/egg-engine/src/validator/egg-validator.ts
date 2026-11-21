import type { PterodactylEgg } from "../parser/egg-format.js";

export interface EggValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateEgg(egg: PterodactylEgg): EggValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!egg.name.trim()) {
    errors.push("Egg name cannot be empty.");
  }

  if (!egg.startup.trim()) {
    errors.push("Startup command cannot be empty.");
  }

  const variables = egg.variables ?? [];
  const seenVariables = new Set<string>();

  for (const variable of variables) {
    const envName = variable.env_variable;

    if (!ENV_NAME_PATTERN.test(envName)) {
      errors.push(`Invalid environment variable name: ${envName}`);
    }

    if (seenVariables.has(envName)) {
      errors.push(`Duplicate environment variable: ${envName}`);
    }

    seenVariables.add(envName);
  }

  if (!egg.docker_images || Object.keys(egg.docker_images).length === 0) {
    warnings.push("No Docker images were defined.");
  }

  if (!egg.config) {
    warnings.push("Egg has no configuration metadata.");
  }

  if (!egg.scripts?.install?.script) {
    warnings.push("Egg does not define an installation script.");
  }

  if (egg.scripts?.privileged === true) {
    warnings.push(
      "The installation script requests privileged execution. MatrixHost will not grant host-level privileges."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
