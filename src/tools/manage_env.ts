import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import type { EnvManagerService, EnvReadResult, EnvWriteResult } from "../services/config/EnvManagerService.js";

const REDACTED_ENV_VALUE = "[REDACTED]";

export function redactEnvReadResult(result: EnvReadResult) {
  const keys = Array.from(new Set([...result.keys, ...Object.keys(result.values)]));
  return {
    ...result,
    keys,
    values: Object.fromEntries(keys.map((key) => [key, REDACTED_ENV_VALUE])),
    redacted: true,
  };
}

export function redactEnvWriteResult(result: EnvWriteResult) {
  return {
    ...result,
    written: result.written.map((entry) => entry.split("=", 1)[0] || entry),
    redacted: true,
  };
}

export function registerManageEnv(server: McpServer, container: ServiceContainer) {
  const envManager = container.resolve<EnvManagerService>("envManager");

  server.registerTool(
    "manage_env",
    {
      description: `TRIGGER: Discover existing env keys or upsert new credentials.
RETURNS: Existing .env keys with redacted values (read) | Write confirmation with key names only (write) | Scaffolded .env keys (scaffold). Auto-manages .env.example.
NEXT: Verify keys set → Proceed with test setup.
COST: Low (~50-100 tokens)
ERROR_HANDLING: Standard

Reads, writes, or scaffolds the .env file.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the test project."),
        "action": z.enum(["read", "write", "scaffold"]),
        "entries": z.array(z.object({
          "key": z.string(),
          "value": z.string()
        })).optional().describe("For 'write' action: array of {key, value} env entries to upsert.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, action, entries } = args as any;
      if (action === "read") {
        return textResult(JSON.stringify(redactEnvReadResult(envManager.read(projectRoot)), null, 2));
      } else if (action === "write") {
        const res = envManager.write(projectRoot, entries || []);
        let output = JSON.stringify(redactEnvWriteResult(res), null, 2);
        
        // Add explanation when keys are skipped
        if (res.skipped.length > 0) {
          output += `\n\n⚠️  Keys skipped: ${res.skipped.join(', ')}\nReason: Values already exist in .env. This tool does not currently expose an overwrite option.`;
        }
        
        return textResult(output);
      } else if (action === "scaffold") {
        const res = envManager.scaffold(projectRoot);
        return textResult(JSON.stringify(redactEnvWriteResult(res), null, 2));
      } else {
        return textResult(`Unknown action: ${action}`);
      }
    }
  );
}
