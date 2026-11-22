import assert from "node:assert/strict";
import { test } from "node:test";

import { buildStartupCommand } from "../src/startup/startup-builder.js";
import { resolveEggVariables } from "../src/variables/variable-resolver.js";

test("shell-quotes Egg variable values in startup templates", () => {
  const result = buildStartupCommand(
    "echo {{MESSAGE}}",
    { MESSAGE: "hello'; echo unsafe" },
  );

  assert.equal(result.success, true);
  assert.equal(
    result.command,
    "echo 'hello'\\''; echo unsafe'",
  );
});

test("rejects startup templates with missing variables", () => {
  const result = buildStartupCommand(
    "java -jar {{SERVER_FILE}}",
    {},
  );

  assert.equal(result.success, false);
  assert.equal(result.command, "");
  assert.deepEqual(result.errors, [
    "Missing startup variable: SERVER_FILE",
  ]);
});

test("enforces required Egg variables even when their value is empty", () => {
  const result = resolveEggVariables(
    [
      {
        env_variable: "SERVER_PORT",
        default_value: "",
        rules: "required|integer",
      },
    ],
    {},
  );

  assert.equal(result.success, false);
  assert.equal(result.environment.SERVER_PORT, undefined);
});

test("rejects customer overrides of non-editable Egg variables", () => {
  const result = resolveEggVariables(
    [
      {
        env_variable: "SERVER_PORT",
        default_value: "25565",
        user_editable: false,
        rules: "required|integer",
      },
    ],
    { SERVER_PORT: "25566" },
  );

  assert.equal(result.success, false);
  assert.deepEqual(result.errors, [
    "SERVER_PORT cannot be changed by the user.",
  ]);
});
