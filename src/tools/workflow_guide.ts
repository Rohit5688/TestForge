import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";

export function registerWorkflowGuide(server: McpServer, container: ServiceContainer) {
  server.registerTool(
    "workflow_guide",
    {
      description: `TRIGGER: Unsure which tool to use OR need workflow guidance OR first time using TestForge\nRETURNS: { workflows: { [name]: { description, steps: Array<step details> } } }\nNEXT: Follow returned workflow steps sequentially\nCOST: Low (static data, no execution, ~100 tokens)\n\nSTART HERE IF UNSURE. Returns step-by-step sequences for: new_project, write_test, run_and_heal, debug_flaky, all.`,
      inputSchema: z.object({
        "workflow": z.enum(["new_project", "write_test", "run_and_heal", "debug_flaky", "all"]).optional()
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { workflow } = args as any;
      const workflows: Record<string, any> = {
        "new_project": {
          "description": "Initialize a new Playwright-BDD project with TestForge scaffolding.",
          "steps": [
            "1. Call setup_project(projectRoot) to bootstrap the directory.",
            "2. Edit mcp-config.json and set baseUrl.",
            "3. Call check_environment(projectRoot) to verify node_modules and browser binaries."
          ]
        },
        "write_test": {
          "description": "Standard flow for creating and verifying a new automated test.",
          "steps": [
            "1. Call inspect_page_dom(url, returnFormat:'json') to fetch semantic locators.",
            "2. Call generate_gherkin_pom_test_suite with testDescription.",
            "3. Call validate_and_write with the generated files to save and run initial verification."
          ]
        },
        "run_and_heal": {
          "description": "Fix a failing test caused by brittle selectors or application changes.",
          "steps": [
            "1. Call run_playwright_test(projectRoot) and identify the failure DNA.",
            "2. Call self_heal_test(errorDna) to get fix instructions.",
            "3. Call verify_selector(candidate) followed by validate_and_write with updated Page Object lines."
          ]
        },
        "debug_flaky": {
          "description": "Analyze non-deterministic failures using trace observability.",
          "steps": [
            "1. Call analyze_trace(projectRoot) for the failing run.",
            "2. Review pending XHR/fetch calls and action timing analysis.",
            "3. Update step definitions with explicit waitForResponse() or state assertions."
          ]
        }
      };

      if (workflow && workflow !== "all") {
        return textResult(JSON.stringify({ [workflow]: workflows[workflow] }, null, 2));
      }
      return textResult(JSON.stringify(workflows, null, 2));
    }
  );
}
