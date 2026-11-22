export interface DockerResourceLimits {
  memoryBytes: number;
  memorySwapBytes: number;
  cpuPercent: number;
  diskBytes: number;
  pidsLimit: number;
}

export interface DockerCreateOptions {
  serverId: string;
  image: string;
  startupCommand: string;
  environment: Record<string, string>;
  limits: DockerResourceLimits;
  networkName: string;
  volumeName: string;
}

export interface DockerContainerSnapshot {
  id: string;
  name: string;
  image: string;
  status: string;
  running: boolean;
  exitCode: number | null;
  serverId: string | null;
  managed: boolean;
}

export interface DockerCreateResult {
  containerId: string;
  serverId: string;
}

export interface DockerCommandResult {
  success: boolean;
  message: string;
}
