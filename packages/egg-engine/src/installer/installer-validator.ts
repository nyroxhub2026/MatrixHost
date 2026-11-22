import type { PterodactylEgg } from "../parser/egg-format.js";

export interface InstallerValidationResult {
  allowed: boolean;
  errors: string[];
  warnings: string[];
  script?: string;
  containerImage?: string;
}

const MAX_INSTALL_SCRIPT_SIZE = 256 * 1024;

export function validateInstaller(
  egg: PterodactylEgg
): InstallerValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const installer = egg.scripts?.install;

  if (!installer?.script) {
    return {
      allowed: true,
      errors: [],
      warnings: ["No installation script was provided."]
    };
  }

  if (egg.scripts?.privileged === true) {
    errors.push("Privileged installation is not permitted.");
  }

  if (installer.script.length > MAX_INSTALL_SCRIPT_SIZE) {
    errors.push("Installation script exceeds the maximum allowed size.");
  }

  if (!installer.container) {
    errors.push("Installer container image is not specified.");
  }

  if (installer.entrypoint && installer.entrypoint.length > 200) {
    errors.push("Installer entrypoint is too long.");
  }

  warnings.push(
    "The installation script must run inside a restricted installer container."
  );

  warnings.push(
    "The installer container must have no host Docker socket or unrestricted host filesystem access."
  );

  warnings.push(
    "The selected installer image must be verified against the administrator's image allowlist."
  );

  return {
    allowed: errors.length === 0,
    errors,
    warnings,
    script: errors.length === 0 ? installer.script : undefined,
    containerImage: errors.length === 0 ? installer.container : undefined
  };
}
