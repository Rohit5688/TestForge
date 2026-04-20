import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { TestContextGathererService } from "../services/dom/TestContextGathererService.js";

export function registerGatherTestContext(server: McpServer, container: ServiceContainer) {
  const gatherer = container.resolve<TestContextGathererService>("gatherer");

  server.registerTool(
    "gather_test_context",
    {
      description: `TRIGGER: BEFORE calling generate_gherkin_pom_test_suite when writing tests for a web app you have NOT inspected yet.
RETURNS: TestContext JSON — verified DOM elements (roles, labels, locators) and XHR/fetch network calls (for waitForResponse patterns).
NEXT: Pass returned testContext to generate_gherkin_pom_test_suite → Eliminates selector guessing, achieves first-pass correct code.
COST: High (headless browser per URL, ~500-2000 tokens depending on page count)
ERROR_HANDLING: Standard

Visits each URL in your test flow, captures verified DOM elements and XHR/fetch calls from a headless browser.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "baseUrl": z.string().describe("Base URL of the application, e.g. https://app.example.com"),
        "paths": z.array(z.string()).describe("Relative paths to visit in order, e.g. [\"/login\", \"/dashboard\"]. May also be full URLs."),
        "storageState": z.string().optional().describe("Path to Playwright storageState JSON for pre-authenticated crawls."),
        "loginMacro": z.object({
          "loginPath": z.string(),
          "userSelector": z.string(),
          "usernameValue": z.string(),
          "passSelector": z.string(),
          "passwordValue": z.string(),
          "submitSelector": z.string()
        }).optional().describe("Optional: perform a login before visiting protected paths.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async (args) => {
      const { baseUrl, paths, storageState, loginMacro } = args as any;
      const context = await gatherer.gather({ 
        baseUrl, 
        paths, 
        storageState, 
        loginMacro 
      });
      return textResult(JSON.stringify(context, null, 2));
    }
  );
}
