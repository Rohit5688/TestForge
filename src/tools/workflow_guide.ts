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
            "3. Call check_environment(projectRoot) to verify node_modules and browser binaries.",
            "4. Call get_project_contract(projectRoot) to warm-start — returns framework, wrapper, dirs, executionCommand in one call."
          ]
        },
        "write_test": {
          "description": "Standard flow for creating and verifying a new automated test.",
          "steps": [
            "1. Call get_project_contract(projectRoot) FIRST — confirms wrapper methods, dirs, executionCommand. Eliminates guessing.",
            "2. Call inspect_page_dom(url, returnFormat:'json') to fetch semantic locators + quality warnings.",
            "3. Call generate_gherkin_pom_test_suite with testDescription. Use preview:true to see plan before writing.",
            "4. Call validate_and_write with generated files. Read [WRITE DIFF] on success, [REJECTION] on failure.",
            "5. If verification failed → call self_heal_test — context is auto-loaded from validate_and_write run."
          ]
        },
        "run_and_heal": {
          "description": "Fix a failing test caused by brittle selectors or application changes.",
          "steps": [
            "1. Call scan_structural_brain(projectRoot) before editing — check if target file is a god node.",
            "2. Call run_playwright_test(projectRoot). Read [FAILURES] block directly — skip log parsing.",
            "3. Call self_heal_test — errorDna auto-loaded if omitted. Returns [RIPPLE AUDIT] of affected files.",
            "4. Call verify_selector(candidate) to confirm fix live before writing.",
            "5. Call validate_and_write with updated Page Object lines."
          ]
        },
        "debug_flaky": {
          "description": "Analyze non-deterministic failures using trace observability and flakiness history.",
          "steps": [
            "1. Call get_flaky_selectors(projectRoot) — returns selectors ranked by fail count. ≥5 fails = permanent replace, not re-heal.",
            "2. Call analyze_trace(projectRoot) for the failing run — surfaces pending XHR/action timing.",
            "3. Review pending XHR/fetch calls and action timing analysis.",
            "4. Update step definitions with explicit waitForResponse() or state assertions.",
            "5. Call heal_and_verify_atomically for high-frequency flaky selectors to lock the fix."
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
