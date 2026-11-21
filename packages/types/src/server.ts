export type ServerStatus =
  | "INSTALLING"
  | "STARTING"
  | "RUNNING"
  | "STOPPING"
  | "OFFLINE"
  | "RESTARTING"
  | "SUSPENDED"
  | "RESTORING"
  | "ERROR";

export type ServerPowerAction =
  | "START"
  | "STOP"
  | "RESTART"
  | "KILL";

export interface ServerResources {
  memory: number;
  swap: number;
  disk: number;
  cpu: number;
  ioWeight: number;
  databases: number;
  allocations: number;
  backups: number;
}

export interface ServerUsage {
  memoryBytes: number;
  diskBytes: number;
  cpuPercent: number;
  networkRxBytes: number;
  networkTxBytes: number;
  uptimeSeconds: number;
  recordedAt: string;
}

export interface ServerAllocation {
  id: string;
  nodeId: string;
  ip: string;
  port: number;
  protocol: "TCP" | "UDP";
  isPrimary: boolean;
}

export interface Server {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  nodeId: string;
  eggId: string;
  image: string;
  status: ServerStatus;
  resources: ServerResources;
  allocations: ServerAllocation[];
  createdAt: string;
  updatedAt: string;
  suspendedAt?: string;
}

export interface CreateServerInput {
  name: string;
  description?: string;
  ownerId: string;
  eggId: string;
  nodeId?: string;
  resources: ServerResources;
  allocationId?: string;
  environment: Record<string, string>;
}

export interface UpdateServerInput {
  name?: string;
  description?: string;
  resources?: Partial<ServerResources>;
}

export interface ServerPowerRequest {
  action: ServerPowerAction;
}
