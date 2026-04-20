import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { DomInspectorService } from "../services/dom/DomInspectorService.js";
import { ContextManager } from "../services/system/ContextManager.js";

export function registerInspectPageDom(server: McpServer, container: ServiceContainer) {
  const domInspector = container.resolve<DomInspectorService>("domInspector");
  const domInspectionCache = container.resolve<Map<string, string>>("domInspectionCache");
  const contextManager = container.resolve<ContextManager>("contextManager");

  server.registerTool(
    "inspect_page_dom",
    {
      description: `TRIGGER: BEFORE generating Page Objects.
RETURNS: Accessibility Tree (semantic DOM) with exact locators — names, roles, test ids.
NEXT: Call generate_gherkin_pom_test_suite with returned locators. TIP: Use returnFormat:'json' — server auto-caches and injects into next generation call.
COST: High (headless browser launch, ~300-1000 tokens)
ERROR_HANDLING: Standard

Navigates to a target URL in a headless browser and returns the Accessibility Tree (semantic DOM).

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "url": z.string().describe("The full URL to inspect (e.g. http://localhost:3000/login)."),
        "projectRoot": z.string().optional().describe("Optional absolute path to the automation project for loading config timeouts."),
        "waitForSelector": z.string().optional().describe("Optional selector to wait for before parsing, if page is slow to render."),
        "returnFormat": z.enum(["markdown", "json"]).optional().describe("Output format. 'markdown' (default) returns Actionable Markdown for LLM prompts. 'json' returns flat JsonElement[] with selectorArgs — use this for custom-wrapper-aware POM generation."),
        "includeIframes": z.boolean().optional().describe("Set to true to also scrape accessibility trees inside nested iframes."),
        "storageState": z.string().optional().describe("Optional absolute path to a Playwright storageState JSON file to bypass login."),
        "loginMacro": z.object({
          "loginUrl": z.string(),
          "userSelector": z.string(),
          "usernameValue": z.string(),
          "passSelector": z.string(),
          "passwordValue": z.string(),
          "submitSelector": z.string()
        }).optional().describe("Optional macro to execute a login sequence BEFORE visiting the target URL. The AI can infer selectors for the login page and pass credentials here.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async (args) => {
      const { url, projectRoot, waitForSelector, returnFormat, includeIframes, storageState, loginMacro } = args as any;
      const format = returnFormat || 'markdown';
      const result = await domInspector.inspect(
        url,
        waitForSelector,
        storageState,
        includeIframes,
        loginMacro,
        30000, // timeoutMs
        false, // enableVisualMode
        format as any
      );

      // Record successful scan in context manager
      contextManager.recordScan(url, result);

      if (format === 'json' && projectRoot) {
        domInspectionCache.set(projectRoot, result);
        return textResult(`✅ Page DOM inspected and cached in JSON format for project: ${projectRoot}. You can now call generate_gherkin_pom_test_suite without passing domJsonContext.`);
      }

      return textResult(truncate(result));
    }
  );
}
