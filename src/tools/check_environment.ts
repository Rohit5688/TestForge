import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import { EnvironmentCheckService } from "../services/setup/EnvironmentCheckService.js";

export function registerCheckEnvironment(server: McpServer, container: ServiceContainer) {
  const envCheck = container.resolve<EnvironmentCheckService>("envCheck");

  server.registerTool(
    "check_environment",
    {
      description: `TRIGGER: Pre-flight check before test run or setup.
RETURNS: { ready: boolean, failCount, warnCount, summary, checks[] }
NEXT: If ready → setup_project or run tests | If not ready → Fix issues listed.
COST: Medium (runs node/playwright/browser checks, ~200-400 tokens)
ERROR_HANDLING: Standard

Verifies Node.js version, Playwright installation, browsers, and configs.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
      inputSchema: z.object({
        "projectRoot": z.string(),
        "baseUrl": z.string().describe("Optional URL to test reachability. If omitted, reads BASE_URL from .env").optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, baseUrl } = args as any;
      const report = await envCheck.check(projectRoot, baseUrl);
      const failCount = report?.failCount !== undefined ? report.failCount : 0;
      const warnCount = report?.warnCount !== undefined ? report.warnCount : 0;
      const responseText = JSON.stringify({
        action: "ENVIRONMENT_CHECK_COMPLETED",
        summary: report?.summary || String(report),
        ready: failCount === 0,
        statusCounts: { fail: failCount, warn: warnCount },
        hint: failCount === 0
          ? "Environment is ready. Proceed to 'setup_project' or 'generate'."
          : "Environment issues detected. Check the summary."
      }, null, 2);
      return textResult(truncate(responseText));
    }
  );
}
