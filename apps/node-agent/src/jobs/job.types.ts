export type AgentJobType =
  | "CREATE_SERVER"
  | "START_SERVER"
  | "STOP_SERVER"
  | "RESTART_SERVER"
  | "KILL_SERVER"
  | "DELETE_SERVER";

export interface AgentJob {
  id: string;
  type: AgentJobType;
  serverId: string;
  payload: Record<string, unknown>;
  attempt: number;
}

export interface AgentJobError {
  code: string;
  message: string;
}

export interface AgentJobResult {
  jobId: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: AgentJobError;
}

export interface AgentJobExecutionResult {
  serverId: string;
  operation: AgentJobType;
  completedAt: string;
}

export interface AgentJobHandler {
  execute(
    job: AgentJob,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>>;
}
