export type DockerPortProtocol = "tcp" | "udp";

export interface DockerPortBinding {
  hostIp: string;
  hostPort: number;
  containerPort: number;
  protocol: DockerPortProtocol;
}

export interface DockerResourceLimits {
  memoryBytes: number;
  memorySwapBytes: number;
  cpuPercent: number;
  diskBytes: number;
  pidsLimit: number;
}

export interface DockerInstallerConfig {
  image: string;
  entrypoint?: string;
  script: string;
  environment: Record<string, string>;
}

export interface DockerCreateOptions {
  serverId: string;
  image: string;
  startupCommand: string;
  environment: Record<string, string>;
  limits: DockerResourceLimits;
  networkName: string;
  ports: DockerPortBinding[];
  installer?: DockerInstallerConfig;
}

export interface DockerContainerCreateOptions {
  serverId: string;
  image: string;
  name: string;
  startupCommand: string;
  environment: Record<string, string>;
  memoryBytes: number;
  memorySwapBytes: number;
  cpuPercent: number;
  diskBytes: number;
  pidsLimit: number;
  networkName: string;
  ports: DockerPortBinding[];
  configHash: string;
}

export interface DockerNetworkInfo {
  id: string;
  name: string;
  driver: string;
  serverId: string;
  managed: boolean;
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
  configHash: string | null;
  mountTargets: string[];
}

export interface DockerCreateResult {
  containerId: string;
  serverId: string;
  networkName: string;
}

export interface DockerCommandResult {
  success: boolean;
  message: string;
}
