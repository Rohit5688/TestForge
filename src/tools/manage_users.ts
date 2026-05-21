import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { UserStoreService } from "../services/config/UserStoreService.js";
import type { UserStoreReadResult } from "../services/config/UserStoreTypes.js";

export function redactUserStoreReadResult(result: UserStoreReadResult) {
  return {
    environment: result.environment,
    filePath: result.filePath,
    exists: result.exists,
    roles: result.roles,
    userCount: result.roles.length,
    users: Object.fromEntries(
      Object.entries(result.users).map(([role, credential]) => [
        role,
        {
          role: credential.role ?? role,
          fields: Object.keys(credential),
          redacted: true,
        },
      ])
    ),
    redacted: true,
  };
}

export function registerManageUsers(server: McpServer, container: ServiceContainer) {
  const userStore = container.resolve<UserStoreService>("userStore");

  server.registerTool(
    "manage_users",
    {
      description: `TRIGGER: Manage multi-environment test users.
RETURNS: Role list with redacted credential fields (list) | Updated roles config (add-role) | Scaffolded users file (scaffold).
NEXT: Verify user roles exist → Reference in test steps via getUser() helper.
COST: Low (~50-100 tokens)
ERROR_HANDLING: Standard

Modifies users.{env}.json for multi-environment test account management.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
      inputSchema: z.object({
        "projectRoot": z.string(),
        "action": z.enum(["list", "add-role", "scaffold"]),
        "environment": z.string().optional().describe("Target environment (e.g. 'staging'). Defaults to currentEnvironment in mcp-config.json."),
        "roles": z.array(z.string()).optional().describe("Role names to add (for 'add-role'), e.g. ['admin', 'readonly'].")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, action, environment, roles } = args as any;
      const env = environment || "staging";
      if (action === "list") {
        const result = userStore.read(projectRoot, env);
        return textResult(truncate(JSON.stringify(redactUserStoreReadResult(result), null, 2)));
      } else if (action === "add-role") {
        const result = userStore.addRoles(projectRoot, env, roles || []);
        return textResult(truncate(JSON.stringify(result, null, 2)));
      } else if (action === "scaffold") {
        const result = userStore.scaffold(projectRoot, [env], roles);
        return textResult(truncate(JSON.stringify(result, null, 2)));
      } else {
        return textResult(`Unknown action: ${action}`);
      }
    }
  );
}
