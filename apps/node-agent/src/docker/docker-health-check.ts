import type { DockerRuntime } from "./docker-runtime.js";

export interface DockerHealthCheckResult {
  healthy: boolean;
  checkedAt: string;
  dockerAvailable: boolean;
  dockerVersion: string | null;
  errors: string[];
}

export class DockerHealthCheck {
  constructor(
    private readonly runtime: DockerRuntime,
  ) {}

  async check(): Promise<DockerHealthCheckResult> {
    const checkedAt = new Date().toISOString();
    const errors: string[] = [];

    const status = await this.runtime.status();

    if (!status.available) {
      errors.push("Docker Engine is unavailable.");
    }

    return {
      healthy: status.available,
      checkedAt,
      dockerAvailable: status.available,
      dockerVersion: status.version,
      errors,
    };
  }
}
