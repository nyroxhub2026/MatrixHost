import type { PterodactylEggVariable } from "../parser/egg-format.js";

export interface VariableResolutionResult {
  success: boolean;
  environment: Record<string, string>;
  errors: string[];
}

export function resolveEggVariables(
  variables: PterodactylEggVariable[],
  suppliedValues: Record<string, string | number | boolean | undefined>
): VariableResolutionResult {
  const environment: Record<string, string> = {};
  const errors: string[] = [];

  for (const variable of variables) {
    const name = variable.env_variable;
    const supplied = suppliedValues[name];

    let value: string;

    if (supplied !== undefined) {
      value = String(supplied);
    } else if (variable.default_value !== undefined && variable.default_value !== null) {
      value = String(variable.default_value);
    } else {
      value = "";
    }

    if (variable.user_editable === false && supplied !== undefined) {
      errors.push(`${name} cannot be changed by the user.`);
      continue;
    }

    const rules = variable.rules?.trim();

    if (rules && value !== "") {
      const validation = validateVariableRules(value, rules);

      if (!validation.valid) {
        errors.push(`${name}: ${validation.message}`);
        continue;
      }
    }

    environment[name] = value;
  }

  return {
    success: errors.length === 0,
    environment,
    errors
  };
}

function validateVariableRules(
  value: string,
  rules: string
): { valid: boolean; message: string } {
  const parts = rules.split("|").map((part) => part.trim());

  for (const rule of parts) {
    if (rule === "required" && value.length === 0) {
      return { valid: false, message: "This value is required." };
    }

    if (rule === "string" && typeof value !== "string") {
      return { valid: false, message: "Expected a string." };
    }

    if (rule === "numeric" && !/^-?\d+(\.\d+)?$/.test(value)) {
      return { valid: false, message: "Expected a numeric value." };
    }

    if (rule === "integer" && !/^-?\d+$/.test(value)) {
      return { valid: false, message: "Expected an integer." };
    }

    const min = rule.match(/^min:(\d+)$/);

    if (min && value.length < Number(min[1])) {
      return {
        valid: false,
        message: `Minimum length is ${min[1]}.`
      };
    }

    const max = rule.match(/^max:(\d+)$/);

    if (max && value.length > Number(max[1])) {
      return {
        valid: false,
        message: `Maximum length is ${max[1]}.`
      };
    }

    const inValues = rule.match(/^in:(.+)$/);

    if (inValues) {
      const allowed = inValues[1].split(",").map((item) => item.trim());

      if (!allowed.includes(value)) {
        return {
          valid: false,
          message: "Value is not in the allowed list."
        };
      }
    }
  }

  return { valid: true, message: "" };
}
