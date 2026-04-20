import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { UtilAuditService } from "../services/audit/UtilAuditService.js";

export function registerAuditUtils(server: McpServer, container: ServiceContainer) {
  const utilAudit = container.resolve<UtilAuditService>("utilAudit");

  server.registerTool(
    "audit_utils",
    {
      description: `TRIGGER: Check for missing Playwright API surface wrappers.
RETURNS: Report of missing utils helper methods with count of implemented vs expected actions.
NEXT: Implement missing helpers → Ensure custom wrapper coverage.
COST: Low (~100-200 tokens)
ERROR_HANDLING: Standard

Scans the utils layer to report missing helper methods. Custom-wrapper-aware.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "customWrapperPackage": z.string().optional().describe("Optional: package name or path to a custom BasePage/wrapper. E.g. '@myorg/playwright-helpers'. Methods from this package are counted as already present.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, customWrapperPackage } = args as any;
      const report = await utilAudit.audit(projectRoot, customWrapperPackage);
      return textResult(JSON.stringify(report, null, 2));
    }
  );
}
