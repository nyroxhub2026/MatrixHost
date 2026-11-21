export const SERVER_STATUSES = {
  INSTALLING: "INSTALLING",
  STARTING: "STARTING",
  RUNNING: "RUNNING",
  STOPPING: "STOPPING",
  OFFLINE: "OFFLINE",
  RESTARTING: "RESTARTING",
  SUSPENDED: "SUSPENDED",
  RESTORING: "RESTORING",
  ERROR: "ERROR"
} as const;

export type ServerStatus =
  (typeof SERVER_STATUSES)[keyof typeof SERVER_STATUSES];

export const SERVER_STATUS_LABELS: Record<ServerStatus, string> = {
  INSTALLING: "Installing",
  STARTING: "Starting",
  RUNNING: "Running",
  STOPPING: "Stopping",
  OFFLINE: "Offline",
  RESTARTING: "Restarting",
  SUSPENDED: "Suspended",
  RESTORING: "Restoring",
  ERROR: "Error"
};

export const SERVER_STATUS_COLORS: Record<ServerStatus, string> = {
  INSTALLING: "blue",
  STARTING: "blue",
  RUNNING: "green",
  STOPPING: "yellow",
  OFFLINE: "gray",
  RESTARTING: "yellow",
  SUSPENDED: "orange",
  RESTORING: "purple",
  ERROR: "red"
};

export const SERVER_STATUS_TRANSITIONS: Record<
  ServerStatus,
  readonly ServerStatus[]
> = {
  INSTALLING: ["STARTING", "ERROR", "SUSPENDED"],
  STARTING: ["RUNNING", "OFFLINE", "ERROR", "STOPPING"],
  RUNNING: ["STOPPING", "RESTARTING", "SUSPENDED", "ERROR"],
  STOPPING: ["OFFLINE", "ERROR"],
  OFFLINE: ["STARTING", "INSTALLING", "SUSPENDED", "RESTORING", "ERROR"],
  RESTARTING: ["RUNNING", "OFFLINE", "ERROR"],
  SUSPENDED: ["OFFLINE", "ERROR"],
  RESTORING: ["OFFLINE", "RUNNING", "ERROR"],
  ERROR: ["INSTALLING", "STARTING", "OFFLINE", "SUSPENDED"]
};

export function canTransitionServerStatus(
  current: ServerStatus,
  next: ServerStatus
): boolean {
  return SERVER_STATUS_TRANSITIONS[current].includes(next);
}

export function isServerStatus(value: unknown): value is ServerStatus {
  return (
    typeof value === "string" &&
    Object.values(SERVER_STATUSES).includes(value as ServerStatus)
  );
}
