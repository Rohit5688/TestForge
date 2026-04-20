import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { NavigationGraphService } from "../services/nav/NavigationGraphService.js";

export function registerExportNavigationMap(server: McpServer, container: ServiceContainer) {
  const getNavService = container.resolve<(projectRoot: string) => NavigationGraphService>("getNavService");

  server.registerTool(
    "export_navigation_map",
    {
      description: `TRIGGER: Visualize app navigation. After discover_app_flow OR for static nav analysis.
RETURNS: { diagram: mermaid string, knownScreens: string[], source: static|live|seed }
NEXT: Save diagram to .TestForge/nav-graph.md (auto-done) → Use with generate_gherkin_pom_test_suite for context.
COST: Low (~100-300 tokens, static analysis only — run discover_app_flow first for richer maps)
ERROR_HANDLING: Standard

Performs static analysis of feature files and page objects to build a URL navigation graph.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
      inputSchema: z.object({
        projectRoot: z.string().describe("Absolute path to the automation project."),
        forceRebuild: z.boolean().optional().describe("If true, re-analyzes files ignoring cache.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, forceRebuild } = args as any;
      const navSvc = getNavService(projectRoot);
      await navSvc.buildFromStaticAnalysis(forceRebuild ?? false);
      const diagram = navSvc.exportMermaidDiagram();
      const screens = navSvc.getKnownScreens();
      const source = navSvc.getMapSource();
      const sourceNote = source === 'seed'
        ? '🌱 Seed map: no existing navigation data found. Run discover_app_flow to build a real map.'
        : source === 'static'
          ? '📊 Static analysis: built from feature files and page objects.'
          : '🔭 Live + Static: enriched with live Playwright crawl.';
      const output = `## Navigation Map\n\n${sourceNote}\nKnown pages: ${screens.length}\n\n${diagram}\n\nPages:\n${screens.map((s: string) => `  - ${s}`).join('\n')}`;
      return textResult(truncate(output));
    }
  );
}
