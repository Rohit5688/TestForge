import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import type { McpConfigService } from "../services/config/McpConfigService.js";
import { DependencyService } from "../services/config/DependencyService.js";
import * as fs from "fs";
import * as path from "path";

/**
 * get_project_contract
 *
 * Returns a compact warm-start payload describing the project's framework,
 * wrapper library, directory layout, and execution command.
 *
 * Cost: file reads only — no browser, no AST, no network.
 * Designed to be called once at the start of any task session.
 */
export function registerGetProjectContract(server: McpServer, container: ServiceContainer) {
  const mcpConfig = container.resolve<McpConfigService>("mcpConfig");
  const depService = new DependencyService();

  server.registerTool(
    "get_project_contract",
    {
      description: `TRIGGER: Call ONCE at the start of any task session before generating or editing tests.
RETURNS: Compact JSON — framework, custom wrapper, wrapper methods, directories, execution command, setPage requirement.
NEXT: Use returned contract to warm-start generation without extra file reads.
COST: Low (file reads only — no browser, no AST)
ERROR_HANDLING: Standard

Returns the project's technical contract: all facts needed to generate correct code on the first pass.

OUTPUT: Read returned JSON, proceed to generate or edit.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot } = args as { projectRoot: string };

      const config = mcpConfig.read(projectRoot);
      const deps = depService.parseDependencies(projectRoot);

      // Detect dirs — mcp-config.json is the source of truth.
      // Fallback probes only generic community conventions (no team-specific paths hardcoded).
      const featuresDir = config.dirs?.features
        || (['features', 'src/features', 'test/features', 'e2e/features']
            .find(d => fs.existsSync(path.join(projectRoot, d)))
          ?? 'features');

      const stepsDir = config.dirs?.steps || config.dirs?.stepDefinitions
        || (['step-definitions', 'steps', 'src/steps', 'e2e/steps', 'test/steps']
            .find(d => fs.existsSync(path.join(projectRoot, d)))
          ?? 'step-definitions');

      const pagesDir = config.dirs?.pages
        || (['pages', 'src/pages', 'e2e/pages', 'test/pages']
            .find(d => fs.existsSync(path.join(projectRoot, d)))
          ?? 'pages');

      // Detect wrapper — read from mcp-config.json first, fallback to default
      // Priority: customWrapper.package > customWrapperPackage > basePageClass > vasu-playwright-utils (default)
      let wrapperMethods: string[] = [];
      const wrapperPkg = (config as any).customWrapper?.package 
        || config.customWrapperPackage 
        || config.basePageClass 
        || 'vasu-playwright-utils';
      try {
        const pkgPath = path.join(projectRoot, 'node_modules', wrapperPkg, 'package.json');
        const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        // Prefer exports keys as method hints if no explicit list
        if (pkgJson.exports) {
          wrapperMethods = Object.keys(pkgJson.exports)
            .map(k => k.replace(/^\.\//, ''))
            .filter(k => !k.startsWith('.') && k !== 'index');
        }
      } catch {
        // Not installed or no package.json — return empty list gracefully
      }

      const contract = {
        framework: deps.hasPlaywrightBdd ? 'playwright-bdd' : deps.hasPlaywright ? 'playwright' : 'unknown',
        customWrapper: wrapperPkg,
        wrapperInstalled: fs.existsSync(path.join(projectRoot, 'node_modules', wrapperPkg)),
        wrapperMethods: wrapperMethods.length > 0 ? wrapperMethods : ['click', 'fill', 'hover', 'gotoURL', 'getLocator', 'getLocatorByRole', 'getLocatorByTestId', 'getLocatorByPlaceholder', 'expectElementToBeVisible', 'expectElementToBeHidden', 'setPage', 'getPage'],
        setPageRequired: deps.hasPlaywrightBdd, // playwright-bdd projects require setPage in first Given step
        dirs: { features: featuresDir, steps: stepsDir, pages: pagesDir },
        executionCommand: config.executionCommand || 'npm test',
        waitStrategy: config.waitStrategy || 'domcontentloaded',
        baseUrl: config.envKeys?.baseUrl || '',
        currentEnvironment: config.currentEnvironment || 'staging',
        projectRoot
      };

      // Load learnings from mcp-learning.json — compact summary (pattern only, no full solution)
      let learningsSummary: Array<{ pattern: string; tags?: string[] }> = [];
      const learningsPath = path.join(projectRoot, '.TestForge', 'mcp-learning.json');
      try {
        if (fs.existsSync(learningsPath)) {
          const raw = JSON.parse(fs.readFileSync(learningsPath, 'utf8'));
          const entries = Array.isArray(raw) ? raw : (raw.entries ?? raw.rules ?? []);
          learningsSummary = entries.slice(0, 20).map((e: any) => ({
            pattern: e.issuePattern ?? e.pattern ?? e.issue ?? String(e).slice(0, 80),
            tags: e.tags
          }));
        }
      } catch { /* soft fail */ }

      // Load navigation map — compact screen list only
      let knownScreens: string[] = [];
      let navMapSource: string = 'none';
      const navMapPath = path.join(projectRoot, '.TestForge', 'navigation-map.json');
      try {
        if (fs.existsSync(navMapPath)) {
          const navMap = JSON.parse(fs.readFileSync(navMapPath, 'utf8'));
          navMapSource = navMap.source ?? 'unknown';
          knownScreens = Object.values(navMap.nodes ?? {}).map(
            (n: any) => `${n.pageName} — ${n.url}`
          );
        }
      } catch { /* soft fail */ }

      const sections: string[] = [
        `[PROJECT CONTRACT]\n${JSON.stringify(contract, null, 2)}`,
        `\nUse this contract to generate correct code without additional file reads. ` +
        `setPageRequired=true means the first Given step MUST destructure {page} and call setPage(page).`
      ];

      if (learningsSummary.length > 0) {
        sections.push(
          `\n[SESSION LEARNINGS] (${learningsSummary.length} rules loaded from mcp-learning.json — apply these automatically):\n` +
          learningsSummary.map((l, i) => `  ${i + 1}. ${l.pattern}${l.tags?.length ? ` [${l.tags.join(', ')}]` : ''}`).join('\n')
        );
      }

      if (knownScreens.length > 0) {
        sections.push(
          `\n[NAVIGATION MAP] source:${navMapSource} — ${knownScreens.length} known screens:\n` +
          knownScreens.map(s => `  • ${s}`).join('\n') +
          `\n  → Run export_navigation_map for the full Mermaid diagram.`
        );

        // Coverage gap: cross-ref nav screens vs feature file content
        try {
          const featuresDirAbs = path.isAbsolute(featuresDir)
            ? featuresDir
            : path.join(projectRoot, featuresDir);

          if (fs.existsSync(featuresDirAbs)) {
            // Collect all .feature file content into one string for fast scanning
            const featureContent = (function readFeatureFiles(dir: string): string {
              let content = '';
              for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) content += readFeatureFiles(full);
                else if (entry.name.endsWith('.feature')) content += fs.readFileSync(full, 'utf8');
              }
              return content;
            })(featuresDirAbs);

            // Collect URL paths explicitly navigated to in feature files.
            // Matches patterns like:
            //   Given I navigate to "/products/shoes"
            //   Given I am on "/dashboard"
            //   And the user visits "/checkout"
            // Also collects any quoted path-like strings (starts with /) as a fallback.
            const navigatedPaths = new Set<string>();
            const navPatterns = [
              // Gherkin step patterns with URL arguments
              /(?:navigate to|am on|visit|open|go to|load|url is)\s+["']([^"']+)["']/gi,
              // Feature file URL references — quoted strings starting with /
              /"(\/[^"]{2,})"/g,
              /'(\/[^']{2,})'/g,
            ];
            for (const rx of navPatterns) {
              let m;
              const src = new RegExp(rx.source, rx.flags); // reset lastIndex
              while ((m = src.exec(featureContent)) !== null) {
                navigatedPaths.add(m[1]!.split('?')[0]!); // strip query strings
              }
            }

            const uncovered = knownScreens.filter(screen => {
              const urlPart = (screen.split(' — ')[1] ?? '').trim();
              if (!urlPart || urlPart === '/' || urlPart.startsWith('http')) return false;
              const cleanUrl = urlPart.split('?')[0]!; // strip query strings

              // Exact or prefix match against collected navigation paths
              return ![...navigatedPaths].some(p =>
                p === cleanUrl ||
                cleanUrl.startsWith(p + '/') ||
                p.startsWith(cleanUrl + '/')
              );
            });

            if (uncovered.length > 0) {
              sections.push(
                `\n[COVERAGE GAPS] ${uncovered.length} screen(s) with no feature file coverage:\n` +
                uncovered.map(s => `  ⚠️ ${s}`).join('\n') +
                `\n  → Consider adding feature files for these screens.`
              );
            }
          }
        } catch { /* soft fail — never block contract load */ }
      }

      return textResult(sections.join(''));
    }
  );
}
