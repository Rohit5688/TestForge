import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { NavigationGraphService } from "../services/nav/NavigationGraphService.js";
import * as fs from "fs";

export function registerDiscoverAppFlow(server: McpServer, container: ServiceContainer) {
  const getNavService = container.resolve<(projectRoot: string) => NavigationGraphService>("getNavService");

  server.registerTool(
    "discover_app_flow",
    {
      description: `TRIGGER: User says 'map the app / discover nav / crawl the site / what screens exist'\nWHAT IT DOES: Launches a headless Playwright browser, spiders links from startUrl (same-origin only), records page transitions into a persistent navigation graph (.TestForge/navigation-map.json) and exports a Mermaid diagram.\nRETURNS: { pagesDiscovered: number, diagram: mermaid, knownPaths: string }\nNEXT: export_navigation_map to view diagram, or generate_gherkin_pom_test_suite (diagram auto-injected into prompt via TASK-34).\nCOST: Medium (launches browser, crawls up to 25 pages).\nOUTPUT: Ack (≤10 words), proceed.`,
      inputSchema: z.object({
        projectRoot: z.string().describe("Absolute path to the automation project."),
        startUrl: z.string().describe("The URL to start crawling from (e.g. http://localhost:3000)."),
        storageState: z.string().optional().describe("Optional Playwright storageState JSON path for pre-authenticated crawls."),
        maxPages: z.number().optional().describe("Max pages to crawl (default: 25).")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async (args) => {
      const { projectRoot, startUrl, storageState, maxPages } = args as any;

      // Guard: warn if storageState path provided but file does not exist
      let resolvedStorageState = storageState;
      let storageStateWarning = '';
      if (storageState) {
        if (!fs.existsSync(storageState)) {
          storageStateWarning = `[WARN] storageState file not found at "${storageState}". Crawling WITHOUT authentication — will likely hit the login wall and discover only public pages.\nTo fix: call inspect_page_dom with saveStorageState="${storageState}" to login and save session first.\n\n`;
          resolvedStorageState = undefined; // fall back to unauthenticated crawl
        }
      }

      const navSvc = getNavService(projectRoot);
      const graph = await navSvc.discoverAppFlow(startUrl, resolvedStorageState, maxPages ?? 25);
      const diagram = navSvc.exportMermaidDiagram();
      const screens = navSvc.getKnownScreens();
      const knownPaths = navSvc.getKnownPathsText();
      const result = storageStateWarning + JSON.stringify({
        pagesDiscovered: Object.keys(graph.nodes).length,
        source: graph.source,
        knownScreens: screens,
        knownPaths,
        diagram
      }, null, 2);
      return textResult(truncate(result));
    }
  );
}
