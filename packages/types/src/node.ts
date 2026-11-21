export type NodeStatus =
  | "ONLINE"
  | "OFFLINE"
  | "CONNECTING"
  | "MAINTENANCE"
  | "ERROR";

export interface NodeHardware {
  hostname: string;
  operatingSystem: string;
  architecture: string;
  cpuModel: string;
  cpuCores: number;
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  diskTotalBytes: number;
  diskFreeBytes: number;
}

export interface NodeNetwork {
  publicAddress: string;
  listenAddress: string;
  listenPort: number;
  tlsEnabled: boolean;
}

export interface NodeResources {
  memoryAllocatedBytes: number;
  diskAllocatedBytes: number;
  cpuAllocated: number;
  serverCount: number;
}

export interface Node {
  id: string;
  name: string;
  description?: string;
  location?: string;
  status: NodeStatus;
  hardware: NodeHardware;
  network: NodeNetwork;
  resources: NodeResources;
  dockerVersion?: string;
  agentVersion?: string;
  lastHeartbeatAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNodeInput {
  name: string;
  description?: string;
  location?: string;
  publicAddress: string;
  listenAddress: string;
  listenPort: number;
  tlsEnabled: boolean;
  memoryOverallocatePercent: number;
  diskOverallocatePercent: number;
  cpuOverallocatePercent: number;
}

export interface NodeHeartbeat {
  nodeId: string;
  timestamp: string;
  hardware: NodeHardware;
  dockerVersion: string;
  agentVersion: string;
  runningServerCount: number;
}
