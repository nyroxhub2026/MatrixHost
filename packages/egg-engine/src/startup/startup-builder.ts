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
      const value = environment[variableName];

      if (
        !Object.prototype.hasOwnProperty.call(environment, variableName) ||
        value === undefined
      ) {
        errors.push(`Missing startup variable: ${variableName}`);
        return "";
      }

      return shellQuote(value);
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
    placeholders.add(match[1]!);
  }

  return [...placeholders];
}
