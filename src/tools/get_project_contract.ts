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

      // Detect dirs from filesystem conventions
      const featuresDir = fs.existsSync(path.join(projectRoot, 'features')) ? 'features'
        : fs.existsSync(path.join(projectRoot, 'src/features')) ? 'src/features'
        : 'features';

      const stepsDir = fs.existsSync(path.join(projectRoot, 'step-definitions')) ? 'step-definitions'
        : fs.existsSync(path.join(projectRoot, 'steps')) ? 'steps'
        : fs.existsSync(path.join(projectRoot, 'src/steps')) ? 'src/steps'
        : 'step-definitions';

      const pagesDir = fs.existsSync(path.join(projectRoot, 'pages')) ? 'pages'
        : fs.existsSync(path.join(projectRoot, 'src/pages')) ? 'src/pages'
        : 'pages';

      // Detect wrapper methods from installed package if possible
      let wrapperMethods: string[] = [];
      const wrapperPkg = config.basePageClass || 'vasu-playwright-utils';
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

      return textResult(
        `[PROJECT CONTRACT]\n${JSON.stringify(contract, null, 2)}\n\n` +
        `Use this contract to generate correct code without additional file reads. ` +
        `setPageRequired=true means the first Given step MUST destructure {page} and call setPage(page).`
      );
    }
  );
}
