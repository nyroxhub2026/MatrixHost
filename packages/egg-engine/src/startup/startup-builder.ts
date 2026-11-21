export interface StartupBuildResult {
  success: boolean;
  command: string;
  errors: string[];
}

const PLACEHOLDER_PATTERN = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export function buildStartupCommand(
  template: string,
  environment: Record<string, string>
): StartupBuildResult {
  const errors: string[] = [];

  if (!template.trim()) {
    return {
      success: false,
      command: "",
      errors: ["Startup template cannot be empty."]
    };
  }

  const command = template.replace(
    PLACEHOLDER_PATTERN,
    (_match, variableName: string) => {
      if (!Object.prototype.hasOwnProperty.call(environment, variableName)) {
        errors.push(`Missing startup variable: ${variableName}`);
        return "";
      }

      return shellQuote(environment[variableName]);
    }
  );

  return {
    success: errors.length === 0,
    command: errors.length === 0 ? command : "",
    errors
  };
}

export function findStartupPlaceholders(template: string): string[] {
  const placeholders = new Set<string>();

  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    placeholders.add(match[1]);
  }

  return [...placeholders];
}
