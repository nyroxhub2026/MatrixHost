import type { PterodactylEgg } from "../parser/egg-format.js";

export type CompatibilityLevel =
  | "COMPATIBLE"
  | "PARTIAL"
  | "UNSUPPORTED";

export interface CompatibilityResult {
  level: CompatibilityLevel;
  supportedFeatures: string[];
  unsupportedFeatures: string[];
  warnings: string[];
}

const SUPPORTED_FEATURES = new Set([
  "minecraft",
  "minecraft-java",
  "minecraft-bedrock",
  "steam",
  "source"
]);

export function checkEggCompatibility(
  egg: PterodactylEgg
): CompatibilityResult {
  const supportedFeatures: string[] = [];
  const unsupportedFeatures: string[] = [];
  const warnings: string[] = [];

  for (const feature of egg.features ?? []) {
    const normalized = feature.toLowerCase();

    if (SUPPORTED_FEATURES.has(normalized)) {
      supportedFeatures.push(feature);
    } else {
      unsupportedFeatures.push(feature);
    }
  }

  if (!egg.docker_images || Object.keys(egg.docker_images).length === 0) {
    warnings.push("No Docker images are declared.");
  }

  if (egg.config?.extends) {
    warnings.push(
      "Inherited Egg configurations require separate resolution."
    );
    unsupportedFeatures.push("config.extends");
  }

  if (egg.scripts?.install?.script) {
    warnings.push(
      "Installation script requires isolated-container validation."
    );
  }

  if (egg.scripts?.privileged) {
    unsupportedFeatures.push("privileged installer execution");
  }

  let level: CompatibilityLevel;

  if (unsupportedFeatures.length > 0) {
    level = supportedFeatures.length > 0 ? "PARTIAL" : "UNSUPPORTED";
  } else {
    level = "COMPATIBLE";
  }

  return {
    level,
    supportedFeatures,
    unsupportedFeatures,
    warnings
  };
}
