import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import type { McpConfigService } from "../services/config/McpConfigService.js";
import type { EnvManagerService } from "../services/config/EnvManagerService.js";
import { McpErrors } from "../types/ErrorSystem.js";

export function registerManageConfig(server: McpServer, container: ServiceContainer) {
  const mcpConfig = container.resolve<McpConfigService>("mcpConfig");
  const envManager = container.resolve<EnvManagerService>("envManager");

  server.registerTool(
    "manage_config",
    {
      description: `TRIGGER: Read, write, preview, or scaffold project configurations.
RETURNS: Config object (read/preview/write/scaffold) or confirmation string (inject_app/set_credentials).
NEXT: Verify config → Proceed with setup_project or test generation.
COST: Low (~50-200 tokens)
ERROR_HANDLING: Standard

Interacts with mcp-config.json. ACTIONS: 'read' returns raw on-disk content; 'write' deep-merges patch; 'preview' shows what 'write' would produce WITHOUT touching disk; 'scaffold' creates file if missing.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
      inputSchema: z.object({
        "projectRoot": z.string(),
        "operation": z.enum(["read", "write", "scaffold", "preview", "inject_app", "set_credentials"]).optional().describe("The operation to perform."),
        "action": z.enum(["read", "write", "scaffold", "preview"]).optional().describe("DEPRECATED: Use operation instead."),
        "config": z.any().optional().describe("Partial McpConfig to merge in (for 'write'/'scaffold'/'preview'). Missing keys use defaults."),
        "appPath": z.string().optional().describe("Path to inject (for 'inject_app')."),
        "credentials": z.record(z.string(), z.string()).optional().describe("Records to write to .env (for 'set_credentials' or 'write').")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, operation, action, config, appPath, credentials } = args as any;
      const op = (operation || action || "read");

      let responseText = "";
      
      if (op === "read") {
        responseText = JSON.stringify(mcpConfig.read(projectRoot), null, 2);
      } else if (op === "write" || op === "scaffold") {
        responseText = JSON.stringify(mcpConfig.write(projectRoot, config || {}), null, 2);
      } else if (op === "preview") {
        responseText = JSON.stringify(mcpConfig.preview(projectRoot, config || {}), null, 2);
      } else if (op === "inject_app") {
        if (!appPath) {
          throw McpErrors.invalidParameter("appPath", "Missing appPath");
        }
        mcpConfig.write(projectRoot, { projectRoot: appPath });
        responseText = "App path injected into config.";
      } else if (op === "set_credentials") {
        if (!credentials) {
          throw McpErrors.invalidParameter("credentials", "Missing credentials");
        }
        const entries = Object.entries(credentials).map(([key, value]) => ({ key, value: String(value) }));
        envManager.write(projectRoot, entries);
        responseText = "Credentials set in .env.";
      } else {
        responseText = `Unknown operation: ${op}`;
      }

      return textResult(responseText);
    }
  );
}
