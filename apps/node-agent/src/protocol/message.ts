export type AgentConnectedMessage = {
  type: "connected";
  nodeId: string;
  serverTime: string;
  protocolVersion: number;
};

export type AgentPingMessage = {
  type: "ping";
  timestamp: string;
};

export type AgentPongMessage = {
  type: "pong";
  timestamp: string;
};

export type AgentJobMessage = {
  type: "job";
  job: {
    id: string;
    type:
      | "CREATE_SERVER"
      | "START_SERVER"
      | "STOP_SERVER"
      | "RESTART_SERVER"
      | "KILL_SERVER"
      | "DELETE_SERVER";
    serverId: string;
    payload: Record<string, unknown>;
    attempt: number;
  };
};

export type AgentJobAckMessage = {
  type: "job_ack";
  jobId: string;
  accepted: boolean;
};

export type AgentJobResultMessage = {
  type: "job_result";
  jobId: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
};

export type AgentWebSocketMessage =
  | AgentConnectedMessage
  | AgentPingMessage
  | AgentPongMessage
  | AgentJobMessage
  | AgentJobAckMessage
  | AgentJobResultMessage;
