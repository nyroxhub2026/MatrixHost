export type AgentLogLevel =
  | "fatal"
  | "error"
  | "warn"
  | "info"
  | "debug";

export interface AgentLogger {
  fatal(...values: unknown[]): void;
  error(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  info(...values: unknown[]): void;
  debug(...values: unknown[]): void;
}

const LOG_LEVEL_PRIORITY: Record<AgentLogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export function createLogger(
  configuredLevel: AgentLogLevel,
): AgentLogger {
  const threshold = LOG_LEVEL_PRIORITY[configuredLevel];

  const write = (
    level: AgentLogLevel,
    values: unknown[],
  ): void => {
    if (LOG_LEVEL_PRIORITY[level] > threshold) {
      return;
    }

    const method =
      level === "fatal" ? "error" : level;

    console[method]("[MatrixHost Agent]", ...values);
  };

  return {
    fatal: (...values) => write("fatal", values),
    error: (...values) => write("error", values),
    warn: (...values) => write("warn", values),
    info: (...values) => write("info", values),
    debug: (...values) => write("debug", values),
  };
}
