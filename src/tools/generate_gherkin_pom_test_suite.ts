import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { TestGenerationService } from "../services/generation/TestGenerationService.js";
import type { McpConfigService } from "../services/config/McpConfigService.js";
import { DEFAULT_CONFIG } from "../services/config/McpConfigService.js";
import type { CodebaseAnalysisResult } from "../interfaces/ICodebaseAnalyzer.js";

export function registerGenerateGherkinPomTestSuite(server: McpServer, container: ServiceContainer) {
  const generator = container.resolve<TestGenerationService>("generator");
  const mcpConfig = container.resolve<McpConfigService>("mcpConfig");
  const analyzer = container.resolve<any>("analyzer");
  const maintenance = container.resolve<any>("maintenance");
  const userStore = container.resolve<any>("userStore");
  const analysisCache = container.resolve<Map<string, CodebaseAnalysisResult>>("analysisCache");
  const domInspectionCache = container.resolve<Map<string, string>>("domInspectionCache");

  server.registerTool(
    "generate_gherkin_pom_test_suite",
    {
      description: `TRIGGER: Generate a standard Playwright BDD test suite.
RETURNS: Rigid LLM system instruction context — causes chat completion to produce Playwright-BDD JSON (feature files + POM).
NEXT: Follow returned instructions → Call validate_and_write with generated files.
COST: Medium (~500-2000 tokens, includes codebase analysis)
ERROR_HANDLING: Standard

Generates feature files and POM instructions. AUTO-INJECTION: If inspect_page_dom was previously called with returnFormat:'json', server auto-injects element reference into the prompt — no extra params needed.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "testDescription": z.string().describe("Plain English test intent."),
        "baseUrl": z.string().optional(),
        "customWrapperPackage": z.string().optional(),
        "domJsonContext": z.string().optional().describe("Optional: JSON string of elements from inspect_page_dom(returnFormat:'json'). When provided, locators are injected into the generation prompt as explicit field references."),
        "testContext": z.string().optional().describe("Optional: JSON string of TestContext from gather_test_context. When provided, verified DOM elements and network calls are injected into the generation prompt, enabling first-pass correct selector and waitForResponse generation.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, testDescription, baseUrl, customWrapperPackage, domJsonContext, testContext } = args as any;

      // 1. Ensure project metadata is available
      let analysis = analysisCache.get(projectRoot);
      if (!analysis) {
        await maintenance.ensureUpToDate(projectRoot);
        const config = mcpConfig.read(projectRoot);
        const resolvedWrapper = customWrapperPackage || config.basePageClass;
        analysis = await analyzer.analyze(projectRoot, resolvedWrapper);
        analysisCache.set(projectRoot, analysis as CodebaseAnalysisResult);
      }

      // 2. Fetch cached DOM context if not provided
      const resolvedDomContext = domJsonContext || domInspectionCache.get(projectRoot);

      // 3. Enrich analysis with current config and users
      const config = mcpConfig.read(projectRoot);
      const mcpConfigService = container.resolve<McpConfigService>("mcpConfig");
      
      if (analysis) {
        analysis.mcpConfig = {
          version: config.version || '0.0.0',
          upgradeNeeded: (config.version || '0.0.0') < DEFAULT_CONFIG.version,
          allowedTags: config.tags,
          backgroundBlockThreshold: config.backgroundBlockThreshold,
          waitStrategy: config.waitStrategy,
          authStrategy: mcpConfigService.getAuthStrategy(config)
        };

        const userStoreResult = userStore.read(projectRoot, config.currentEnvironment);
        if (userStoreResult.exists && userStoreResult.roles.length > 0) {
          analysis.userRoles = {
            environment: config.currentEnvironment,
            roles: userStoreResult.roles,
            helperImport: `import { getUser } from '../test-data/user-helper';`
          };
        }
      }

      // 4. Generate the rigid core prompt
      if (!analysis) {
          throw new Error(`Analysis missing for project: ${projectRoot}`);
      }

      // 4. Parse testContext string if provided
      let parsedTestContext = undefined;
      if (typeof testContext === 'string' && testContext.trim().length > 0) {
        try {
          parsedTestContext = JSON.parse(testContext);
        } catch (e) {
          // ignore parsing error, pass undefined
        }
      } else if (typeof testContext === 'object') {
        parsedTestContext = testContext;
      }

      const prompt = await generator.generatePromptInstruction(
        testDescription,
        projectRoot,
        analysis! as CodebaseAnalysisResult,
        customWrapperPackage || config.basePageClass,
        baseUrl || config.envKeys.baseUrl,
        "",
        resolvedDomContext,
        parsedTestContext
      );

      return textResult(prompt);
    }
  );
}
