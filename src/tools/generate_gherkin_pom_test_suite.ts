import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import { McpErrors } from "../types/ErrorSystem.js";
import type { TestGenerationService } from "../services/generation/TestGenerationService.js";
import type { McpConfigService } from "../services/config/McpConfigService.js";
import { DEFAULT_CONFIG } from "../services/config/McpConfigService.js";
import type { CodebaseAnalysisResult } from "../interfaces/ICodebaseAnalyzer.js";

/**
 * W2: Cheap generation plan preview.
 * Infers screens from testDescription (keyword heuristics), lists expected outputs.
 * No analysis, no LLM call, no file reads.
 */
function buildGenerationPlan(testDescription: string, projectRoot: string, customWrapper?: string): string {
  const desc = testDescription.toLowerCase();

  // Infer screens from keywords
  const screenKeywords: Record<string, string> = {
    login: 'LoginPage', signup: 'SignupPage', register: 'SignupPage',
    dashboard: 'DashboardPage', home: 'HomePage', profile: 'ProfilePage',
    cart: 'CartPage', checkout: 'CheckoutPage', payment: 'PaymentPage',
    product: 'ProductPage', search: 'SearchPage', settings: 'SettingsPage',
    order: 'OrderPage', confirm: 'ConfirmationPage', account: 'AccountPage'
  };
  const detectedScreens = Object.entries(screenKeywords)
    .filter(([kw]) => desc.includes(kw))
    .map(([, page]) => page);

  // Deduplicate
  const screens = [...new Set(detectedScreens)];
  if (screens.length === 0) screens.push('MainPage'); // fallback for unrecognized flows

  const featureName = testDescription.split(' ').slice(0, 5).join('_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();

  const expectedFiles = [
    `features/${featureName}.feature`,
    ...screens.map(s => `pages/${s}.ts`),
    ...screens.map(s => `step-definitions/${s.replace('Page', '').toLowerCase()}.steps.ts`)
  ];

  return [
    `[GENERATION PLAN]`,
    `Description  : ${testDescription}`,
    `Project Root : ${projectRoot}`,
    `Wrapper      : ${customWrapper || 'vasu-playwright-utils (default)'}`,
    ``,
    `Detected Screens (${screens.length}):`,
    ...screens.map(s => `  • ${s}`),
    ``,
    `Expected Output Files (${expectedFiles.length}):`,
    ...expectedFiles.map(f => `  • ${f}`),
    ``,
    `Rules that apply:`,
    `  • ONE jsonPageObjects entry per detected screen`,
    `  • ONE jsonSteps entry per feature file (step-file-per-page MUST)`,
    `  • PO instances declared ONCE at top of each step file`,
    `  • setPage(page) required in first Given step (playwright-bdd)`,
    ``,
    `If this plan is correct, call generate_gherkin_pom_test_suite again WITHOUT preview:true.`,
    `If screens are wrong, refine testDescription and re-run preview.`
  ].join('\n');
}

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
      description: `TRIGGER: Call AFTER gather_test_context or inspect_page_dom — NOT before. Generates Playwright-BDD test suite.
RETURNS: Rigid LLM system instruction context — causes chat completion to produce Playwright-BDD JSON (feature files + POM).
NEXT: Follow returned instructions → Call validate_and_write with generated files.
COST: Medium (~500-2000 tokens, includes codebase analysis)
ERROR_HANDLING: Throws if no DOM context found — call gather_test_context first.

Generates feature files and POM instructions. AUTO-INJECTION: If inspect_page_dom was previously called with returnFormat:'json', server auto-injects element reference into the prompt — no extra params needed.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "testDescription": z.string().describe("Plain English test intent."),
        "baseUrl": z.string().optional(),
        "customWrapperPackage": z.string().optional(),
        "preview": z.boolean().optional().describe("When true, returns a [GENERATION PLAN] showing expected screens, files, and wrapper state — without generating the full prompt. Use to validate intent before spending tokens."),
        "domJsonContext": z.string().optional().describe("Optional: JSON string of elements from inspect_page_dom(returnFormat:'json'). When provided, locators are injected into the generation prompt as explicit field references."),
        "testContext": z.string().optional().describe("Optional: JSON string of TestContext from gather_test_context. When provided, verified DOM elements and network calls are injected into the generation prompt, enabling first-pass correct selector and waitForResponse generation.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, testDescription, baseUrl, customWrapperPackage, domJsonContext, testContext, preview } = args as any;

      // W2: Preview mode — return generation plan without running analysis or prompt build
      if (preview) {
        return textResult(buildGenerationPlan(testDescription, projectRoot, customWrapperPackage));
      }

      // 1. Ensure project metadata is available
      let analysis = analysisCache.get(projectRoot);
      if (!analysis) {
        await maintenance.ensureUpToDate(projectRoot);
        const config = mcpConfig.read(projectRoot);
        const resolvedWrapper = customWrapperPackage || config.basePageClass;
        try {
          analysis = await analyzer.analyze(projectRoot, resolvedWrapper);
          analysisCache.set(projectRoot, analysis as CodebaseAnalysisResult);
        } catch (e: any) {
          throw McpErrors.projectValidationFailed(
            `Failed to analyze project at "${projectRoot}": ${e?.message ?? String(e)}. Ensure the project is a valid TestForge project and call check_playwright_ready first.`,
            'generate_gherkin_pom_test_suite'
          );
        }
      }

      // 2. Fetch cached DOM context if not provided
      const resolvedDomContext = domJsonContext || domInspectionCache.get(projectRoot);

      // Fix-2 (hardened for fast models): Hard throw when no verified DOM context exists
      if (!resolvedDomContext && !testContext) {
        throw McpErrors.projectValidationFailed(
          `[CONTEXT REQUIRED] No verified DOM context found for "${projectRoot}".\n` +
          `MANDATORY: Call gather_test_context FIRST to capture live selectors and network contracts:\n` +
          `  → gather_test_context({ baseUrl: "<app_url>", paths: ["<page_path>"] })\n` +
          `Then call generate_gherkin_pom_test_suite again — context is auto-injected.\n` +
          `Skipping this step produces guessed selectors that fail at runtime.`,
          'generate_gherkin_pom_test_suite',
          { suggestedNextTools: ['gather_test_context', 'inspect_page_dom'] }
        );
      }

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

      // 4. Parse testContext string if provided
      let parsedTestContext = undefined;
      if (typeof testContext === 'string' && testContext.trim().length > 0) {
        try {
          parsedTestContext = JSON.parse(testContext);
        } catch (e) {
          console.warn(`[generate_gherkin_pom_test_suite] testContext JSON parse failed — proceeding without verified DOM context: ${e instanceof Error ? e.message : e}`);
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
