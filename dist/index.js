import { McpErrors, McpError, McpErrorCode } from './types/ErrorSystem.js';
import { textResult, truncate } from "./utils/responseHelper.js";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Command } from "commander";
import express from "express";
import { CodebaseAnalyzerService } from "./services/CodebaseAnalyzerService.js";
import { TestGenerationService } from "./services/TestGenerationService.js";
import { TestRunnerService } from "./services/TestRunnerService.js";
import { DomInspectorService } from "./services/DomInspectorService.js";
import { SelfHealingService } from "./services/SelfHealingService.js";
import { FileWriterService } from "./services/FileWriterService.js";
import { EnvManagerService } from "./services/EnvManagerService.js";
import { ProjectSetupService } from "./services/ProjectSetupService.js";
import { SuiteSummaryService } from "./services/SuiteSummaryService.js";
import { McpConfigService, DEFAULT_CONFIG } from './services/McpConfigService.js';
import { UserStoreService } from "./services/UserStoreService.js";
import { ProjectMaintenanceService } from "./services/ProjectMaintenanceService.js";
import { SeleniumMigrationService } from "./services/SeleniumMigrationService.js";
import { RefactoringService } from "./services/RefactoringService.js";
import { FixtureDataService } from "./services/FixtureDataService.js";
import { AnalyticsService } from "./services/AnalyticsService.js";
import { LearningService } from "./services/LearningService.js";
import { PipelineService } from "./services/PipelineService.js";
import { PlaywrightSessionService } from "./services/PlaywrightSessionService.js";
import { ASTScrutinizer } from "./utils/ASTScrutinizer.js";
import { JsonToPomTranspiler } from "./utils/JsonToPomTranspiler.js";
import { sanitizeOutput, auditGeneratedCode } from "./utils/SecurityUtils.js";
import { executeSandbox } from "./services/SandboxEngine.js";
import { Questioner } from "./utils/Questioner.js";
// Removed missing errorcodes import
import { EnvironmentCheckService } from "./services/EnvironmentCheckService.js";
import { LocatorAuditService } from "./services/LocatorAuditService.js";
import { UtilAuditService } from "./services/UtilAuditService.js";
import { StagingService } from "./services/StagingService.js";
import { StructuralBrainService } from "./services/StructuralBrainService.js";
import { CoverageAnalysisService } from "./services/CoverageAnalysisService.js";
import { BugReportService } from "./services/BugReportService.js";
import { FileGuard } from "./utils/FileGuard.js";
import { FileStateService } from "./services/FileStateService.js";
import { RequestTracer } from "./utils/RequestTracer.js";
import { Metrics } from "./utils/Metrics.js";
import { FileSuggester } from "./utils/FileSuggester.js";
import { ObservabilityService } from "./services/ObservabilityService.js";
import { PreFlightService } from "./services/PreFlightService.js";
import { TokenBudgetService } from "./services/TokenBudgetService.js";
import { ContextManager } from "./services/ContextManager.js";
import { ErrorDistiller } from "./utils/ErrorDistiller.js";
import { OrchestrationService } from "./services/OrchestrationService.js";
import { NavigationGraphService } from "./services/NavigationGraphService.js";
import { DnaTrackerService } from "./services/DnaTrackerService.js";
// SOLID: Dependency Injection Root
const analyzer = new CodebaseAnalyzerService();
const fileStateService = new FileStateService();
const generator = new TestGenerationService();
const runner = new TestRunnerService();
const domInspector = new DomInspectorService();
const selfHealer = new SelfHealingService();
const fileWriter = new FileWriterService();
const envManager = new EnvManagerService();
const projectSetup = new ProjectSetupService();
const suiteSummary = new SuiteSummaryService();
const mcpConfig = new McpConfigService();
const userStore = new UserStoreService();
const maintenance = new ProjectMaintenanceService();
const seleniumMigrator = new SeleniumMigrationService();
const refactoringService = new RefactoringService();
const fixtureDataService = new FixtureDataService();
const analyticsService = new AnalyticsService();
const learningService = new LearningService();
const pipelineService = new PipelineService();
const sessionService = new PlaywrightSessionService();
const envCheckService = new EnvironmentCheckService();
const locatorAuditService = new LocatorAuditService();
const utilAuditService = new UtilAuditService();
const stagingService = new StagingService();
const coverageAnalysisService = new CoverageAnalysisService();
const bugReportService = new BugReportService();
const dnaTracker = new DnaTrackerService();
const orchestrationService = new OrchestrationService(fileWriter, selfHealer, stagingService, sessionService, learningService);
const server = new McpServer({
    name: "TestForge",
    version: "1.0.0",
});
// --- Observability & Telemetry Wrapper ---
const obs = ObservabilityService.getInstance();
const originalRegisterTool = server.registerTool.bind(server);
server.registerTool = (name, info, handler) => {
    const wrappedHandler = async (args, extraOptions) => {
        const startTime = Date.now();
        const projectRoot = args && typeof args === 'object' ? args.projectRoot : undefined;
        const traceId = obs.toolStart(name, args ?? {});
        try {
            const result = await handler(args, extraOptions);
            let outputSummary = {};
            if (result) {
                outputSummary = {
                    isError: result.isError ?? false,
                    contentLength: JSON.stringify(result).length,
                    hasContent: Array.isArray(result.content) && result.content.length > 0
                };
            }
            obs.toolEnd(traceId, name, true, outputSummary, startTime, projectRoot);
            return result;
        }
        catch (err) {
            obs.toolError(traceId, name, err, startTime, projectRoot);
            throw err;
        }
    };
    return originalRegisterTool(name, info, wrappedHandler);
};
// BUG-03 FIX: Use a per-projectRoot cache instead of a server-wide singleton.
// A shared singleton causes cross-user context contamination in multi-client
// or rapid sequential usage — Client B's analysis overwrites Client A's before
// Client A's generation runs, producing wrong POM suggestions.
const analysisCache = new Map();
// TASK-64: Per-projectRoot NavigationGraphService instances
const navGraphServices = new Map();
function getNavService(projectRoot) {
    if (!navGraphServices.has(projectRoot)) {
        navGraphServices.set(projectRoot, new NavigationGraphService(projectRoot));
    }
    return navGraphServices.get(projectRoot);
}
// --- 18C FIX: Server-side retry session tracking ---
// Tracks how many validate_and_write attempts have been made per project.
// Resets on success or exhaustion, and on any fresh invocation after exhaustion.
const retrySessionMap = new Map();
server.registerTool("workflow_guide", {
    title: "Workflow Guide",
    description: `TRIGGER: Unsure which tool to use OR need workflow guidance OR first time using TestForge
RETURNS: { workflows: { [name]: { description, steps: Array<step details> } } }
NEXT: Follow returned workflow steps sequentially
COST: Low (static data, no execution, ~100 tokens)
ERROR_HANDLING: None - always succeeds.

START HERE IF UNSURE. Returns step-by-step sequences for: new_project, write_test, run_and_heal, debug_flaky, all.

OUTPUT: Ack (≤10 words), proceed.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "workflow": z.enum(["new_project", "write_test", "run_and_heal", "debug_flaky", "all"]).optional()
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async (args) => {
    {
        const ALL_WORKFLOWS = {
            new_project: {
                description: `Set up a brand-new Playwright-BDD automation project from scratch.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
                steps: [
                    "1. check_playwright_ready — Verify Node.js, Playwright, and config.",
                    "2. manage_config (scaffold) — Scaffold new TestForge config.",
                    "3. setup_project — Scaffold the full project structure.",
                    "4. manage_config (write) — Set your deviceName, app path, etc."
                ]
            },
            write_test: {
                description: `Generate a new BDD test scenario from plain English.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
                steps: [
                    "1. analyze_codebase (or execute_sandbox_code) — Scan codebase architecture ONCE. Cache result.",
                    "2. FOR EACH PAGE in the flow — complete steps 2a–2c before moving to the next page:",
                    "2a. inspect_page_dom — Inspect ONE page at a time. Do NOT inspect multiple pages before generating.",
                    "2b. generate_gherkin_pom_test_suite — Generate the Page Object for THIS page only using its DOM snapshot.",
                    "2c. validate_and_write — Write THIS page's files to disk before inspecting the next page.",
                    "3. After all pages are complete: run_playwright_test to validate the full flow.",
                    "CRITICAL: Never call inspect_page_dom for multiple pages before generating. One page at a time keeps token usage under control and context focused."
                ]
            },
            run_and_heal: {
                description: `Run the test suite and fix any tests failing due to broken selectors.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
                steps: [
                    "1. run_playwright_test — Run all or filtered tests.",
                    "2. [If tests fail] inspect_page_dom — Get current DOM snapshot.",
                    "3. self_heal_test — Pass the failure output + DOM to get replacement locator.",
                    "4. validate_and_write — Update and write the fixed files to disk."
                ]
            },
            debug_flaky: {
                description: `Diagnose and fix tests that pass occasionally but fail other times.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
                steps: [
                    "1. run_playwright_test (with overrides) — Run test intensely to catch the flake.",
                    "2. get_system_state — Check for token limits or history.",
                    "3. inspect_page_dom — Grab DOM when test hangs.",
                    "4. Extract trace from TestForge errors."
                ]
            }
        };
        const wf = args?.workflow;
        const result = (!wf || wf === 'all')
            ? ALL_WORKFLOWS
            : ALL_WORKFLOWS[wf] ? { [wf]: ALL_WORKFLOWS[wf] } : ALL_WORKFLOWS;
        return textResult(JSON.stringify({ workflows: result }, null, 2));
    }
});
server.registerTool("check_playwright_ready", {
    description: `Checks if Playwright, configured browsers, baseUrl, and mcp-config are valid/reachable. Use this to verify readiness before tests.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string().describe("Project root to check."),
        "baseUrl": z.string().optional().describe("Optional baseUrl to verify reachability. Defaults to BASE_URL in .env."),
        "forceRefresh": z.boolean().optional().describe("If true, ignores cache to run checks fresh.")
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot, baseUrl, forceRefresh } = args;
        const preFlight = PreFlightService.getInstance();
        const report = await preFlight.runChecks(projectRoot, baseUrl, forceRefresh);
        const formatted = preFlight.formatReport(report);
        if (!report.allPassed) {
            throw McpErrors.projectValidationFailed(formatted, "check_playwright_ready");
        }
        return { content: [{ type: "text", text: formatted }] };
    }
});
server.registerTool("scan_structural_brain", {
    description: `WHEN TO USE: To identify God Nodes (>5 connections) in the architecture before planning refactors. WHAT IT DOES: Scans import graph and caches God Nodes. HOW IT WORKS: Returns a list of risky files that should be modified cautiously.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project.")
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot } = args;
        const brain = StructuralBrainService.getInstance();
        const nodes = await brain.scanProject(projectRoot);
        const results = nodes.map(n => ({
            file: n.file,
            connections: n.connections,
            severity: n.severity
        }));
        return textResult(truncate(JSON.stringify({ godNodes: results }, null, 2)));
    }
});
// ── TASK-47: get_token_budget ─────────────────────────────────────────────────
server.registerTool("get_token_budget", {
    title: "Get Token Budget",
    description: `TRIGGER: User asks 'how many tokens used / check costs / token report'
RETURNS: Per-tool breakdown of estimated session token usage.
NEXT: If CRITICAL (>150k tokens), start a new session.
COST: Low (reads in-memory counters).

OUTPUT INSTRUCTIONS: Display the report as-is. Do not add commentary.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async (_args) => {
    const report = TokenBudgetService.getInstance().getBudgetReport();
    return { content: [{ type: "text", text: report }] };
});
// ── TASK-52: get_system_state ─────────────────────────────────────────────────
server.registerTool("get_system_state", {
    title: "Get System State",
    description: `TRIGGER: User asks 'what is the current state / context pulse / system snapshot'
RETURNS: DOM scan history summary, session token cost, and turn counter.
NEXT: Use compacted history as context before calling generate_gherkin_pom_test_suite.
COST: Low (reads in-memory context).

OUTPUT INSTRUCTIONS: Display the report as-is. Do not add commentary.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async (_args) => {
    const ctx = ContextManager.getInstance();
    const budget = TokenBudgetService.getInstance();
    const history = ctx.getCompactedHistory();
    const lines = [
        `[System State Snapshot]`,
        `DOM Scans This Session: ${ctx.getScanCount()} (${ctx.getUrlCount()} unique URLs)`,
        `Latest URL: ${ctx.getLatestUrl() ?? 'none'}`,
        `Session Tokens: ~${budget.getSessionTokens().toLocaleString()}`,
        '',
        history || '(No DOM scans recorded yet)',
    ];
    return { content: [{ type: "text", text: lines.join('\n') }] };
});
server.registerTool("analyze_codebase", {
    description: `WHEN TO USE: To scan existing codebase structure before generating code. WHAT IT DOES: Analyzes the codebase using AST. Only use this for very small projects (< 5 files). FOR LARGE PROJECTS, ALWAYS USE 'execute_sandbox_code' (Turbo Mode) instead. HOW IT WORKS: Provide projectRoot.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "customWrapperPackage": z.string().describe("Optional package name or local path for base page objects.").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot, customWrapperPackage } = args;
        await maintenance.ensureUpToDate(projectRoot);
        const config = mcpConfig.read(projectRoot);
        const resolvedWrapper = customWrapperPackage || config.basePageClass;
        const analysis = await analyzer.analyze(projectRoot, resolvedWrapper);
        // Auto-heal the local workspace memory so generators never guess the wrong path
        try {
            config.dirs = {
                ...config.dirs,
                features: analysis.detectedPaths.featuresRoot,
                pages: analysis.detectedPaths.pagesRoot,
                stepDefinitions: analysis.detectedPaths.stepsRoot,
            };
            mcpConfig.write(projectRoot, config);
        }
        catch (e) {
            // Ignore write fails if config is in a read-only state or doesn't exist
        }
        // Supplementary metadata for the LLM prompt
        const mcpConfigService = new McpConfigService();
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
                helperImport: `import { getUser } from '../test-data/user-helper.js';`
            };
        }
        analysisCache.set(projectRoot, analysis);
        const _analysisJson = JSON.stringify(analysis, null, 2);
        // TASK-45: Inject Known Navigation Paths from NavigationGraphService
        let navPathsBlock = '';
        try {
            const navSvc = getNavService(projectRoot);
            await navSvc.buildFromStaticAnalysis();
            navPathsBlock = navSvc.getKnownPathsText();
        }
        catch { /* non-fatal */ }
        const _analysisBudgetFooter = TokenBudgetService.getInstance().trackToolCall('analyze_codebase', projectRoot, _analysisJson);
        const _analysisOutput = navPathsBlock
            ? `${_analysisJson}\n\n${navPathsBlock}\n\n${_analysisBudgetFooter}`
            : `${_analysisJson}\n\n${_analysisBudgetFooter}`;
        return textResult(truncate(sanitizeOutput(_analysisOutput)));
    }
});
server.registerTool("generate_gherkin_pom_test_suite", {
    description: `WHEN TO USE: To generate a standard Playwright BDD test suite. WHAT IT DOES: Generates feature files and POM instructions. HOW IT WORKS: Returns a rigid system instruction context to the client LLM, ensuring the chat completion generates the requested Playwright-BDD JSON structure based on previously analyzed context.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "testDescription": z.string().describe("Plain English test intent."),
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "customWrapperPackage": z.string().optional(),
        "baseUrl": z.string().optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { testDescription, projectRoot, customWrapperPackage, baseUrl } = args;
        await maintenance.ensureUpToDate(projectRoot);
        const config = mcpConfig.read(projectRoot);
        const resolvedWrapper = customWrapperPackage || config.basePageClass;
        if (!analysisCache.has(projectRoot)) {
            analysisCache.set(projectRoot, await analyzer.analyze(projectRoot, resolvedWrapper));
        }
        const lastAnalysisResult = analysisCache.get(projectRoot);
        try {
            config.dirs = {
                ...config.dirs,
                features: lastAnalysisResult.detectedPaths.featuresRoot,
                pages: lastAnalysisResult.detectedPaths.pagesRoot,
                stepDefinitions: lastAnalysisResult.detectedPaths.stepsRoot,
            };
            mcpConfig.write(projectRoot, config);
        }
        catch (e) { }
        let memoryPrompt = learningService.getKnowledgePromptInjection(projectRoot, { toolName: 'generate_gherkin_pom_test_suite' }, lastAnalysisResult.mcpLearnDirectives);
        // TF-NEW-14: Inject relevant skill contextually
        try {
            const _filename = fileURLToPath(import.meta.url);
            const _dirname = path.dirname(_filename);
            let skillsDir = path.join(_dirname, '..', 'src', 'skills');
            if (!fs.existsSync(skillsDir)) {
                skillsDir = path.join(_dirname, 'skills');
            }
            const bddSkill = fs.readFileSync(path.join(skillsDir, 'playwright-bdd.md'), 'utf-8');
            memoryPrompt += `\n\n--- SKILL: Playwright BDD ---\n${bddSkill}`;
            const webSkill = fs.readFileSync(path.join(skillsDir, 'web-selectors.md'), 'utf-8');
            memoryPrompt += `\n\n--- SKILL: Web Selectors ---\n${webSkill}`;
            if (testDescription && testDescription.toLowerCase().includes('api')) {
                const apiSkill = fs.readFileSync(path.join(skillsDir, 'api-testing.md'), 'utf-8');
                memoryPrompt += `\n\n--- SKILL: API Testing ---\n${apiSkill}`;
            }
        }
        catch (e) {
            console.error("Failed to load skills:", e);
        }
        const instruction = await generator.generatePromptInstruction(testDescription, projectRoot, lastAnalysisResult, resolvedWrapper, baseUrl, memoryPrompt);
        return textResult(truncate(instruction));
    }
});
import { ErrorClassifier } from "./utils/ErrorClassifier.js";
server.registerTool("run_playwright_test", {
    description: `WHEN TO USE: AFTER generating or updating tests to verify they pass. WHAT IT DOES: Executes the Playwright-BDD test suite natively. HOW IT WORKS: It runs npm test or the specified command and returns the terminal output.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "overrideCommand": z.string().describe("Optional full command to run (e.g. 'npm run test:e2e:smoke'). This bypasses the default executionCommand.").optional(),
        "specificTestArgs": z.string().describe("Optional arguments like a specific feature file path or project flag.").optional(),
        "tags": z.string().describe("Optional: filter by tag(s), e.g. '@smoke' or '@regression'. Passed as --grep to Playwright.").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot, overrideCommand, specificTestArgs, tags } = args;
        const preFlight = PreFlightService.getInstance();
        const report = await preFlight.runChecks(projectRoot);
        if (!report.allPassed) {
            throw McpErrors.projectValidationFailed(preFlight.formatReport(report), "run_playwright_test");
        }
        await maintenance.ensureUpToDate(projectRoot);
        const config = mcpConfig.read(projectRoot);
        const grepArg = tags ? `--grep "${tags}"` : '';
        const combinedArgs = [specificTestArgs, grepArg].filter(Boolean).join(' ');
        const activeCommand = overrideCommand || config.executionCommand;
        const result = await runner.runTests(projectRoot, combinedArgs || undefined, config.timeouts?.testRun || 120000, activeCommand);
        let finalOutput = sanitizeOutput(result.output);
        if (!result.passed) {
            // Transform the failure output into Error DNA
            const distilled = ErrorDistiller.distill(result.output);
            const errorDna = ErrorClassifier.classify(result.output);
            errorDna.causalChain = distilled.causalChain; // blend the high-fidelity causal chain
            const dnaJson = JSON.stringify(errorDna, null, 2);
            finalOutput = `❌ TEST FAILED\n\n=== ERROR DNA ===\n${dnaJson}\n=================\n\n--- Cleaned Output ---\n${distilled.cleanedOutput.slice(0, 5000)}`;
        }
        else {
            selfHealer.resetAttempts(projectRoot);
        }
        const _runBudgetFooter = TokenBudgetService.getInstance().trackToolCall('run_playwright_test', projectRoot, result.output);
        return textResult(truncate(finalOutput + `\n\n${_runBudgetFooter}`));
    }
});
server.registerTool("upgrade_project", {
    description: `WHEN TO USE: To migrate or maintain older setups. WHAT IT DOES: Upgrades an existing Playwright-BDD project to support the latest MCP features (config, user stores, etc.). HOW IT WORKS: Safe and additive idempotent operation.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the project root")
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot } = args;
        const upgradeResult = await maintenance.upgradeProject(projectRoot);
        return {
            content: [{
                    type: "text", text: `🚀 Project upgrade complete!

${upgradeResult}`
                }]
        };
    }
});
server.registerTool("inspect_page_dom", {
    description: `WHEN TO USE: BEFORE generating Page Objects. WHAT IT DOES: Navigates to a target URL in a headless browser and returns the Accessibility Tree (semantic DOM). HOW IT WORKS: Extracts exact locators (names, roles, test ids) to ensure 100% accuracy.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "url": z.string().describe("The full URL to inspect (e.g. http://localhost:3000/login)."),
        "waitForSelector": z.string().describe("Optional selector to wait for before parsing, if page is slow to render.").optional(),
        "storageState": z.string().describe("Optional absolute path to a Playwright storageState JSON file to bypass login.").optional(),
        "includeIframes": z.boolean().describe("Set to true to also scrape accessibility trees inside nested iframes.").optional(),
        "projectRoot": z.string().describe("Optional absolute path to the automation project for loading config timeouts.").optional(),
        "loginMacro": z.object({
            "loginUrl": z.string(),
            "userSelector": z.string(),
            "usernameValue": z.string(),
            "passSelector": z.string(),
            "passwordValue": z.string(),
            "submitSelector": z.string()
        }).describe("Optional macro to execute a login sequence BEFORE visiting the target URL. The AI can infer selectors for the login page and pass credentials here.").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { url, waitForSelector, storageState, includeIframes, loginMacro, projectRoot } = args;
        let sessionTimeout = 30000;
        let enableVisualMode = false;
        if (projectRoot) {
            const preFlight = PreFlightService.getInstance();
            const report = await preFlight.runChecks(projectRoot);
            if (!report.allPassed) {
                throw McpErrors.projectValidationFailed(preFlight.formatReport(report), "inspect_page_dom");
            }
            try {
                const config = mcpConfig.read(projectRoot);
                sessionTimeout = config.timeouts?.sessionStart ?? 30000;
                enableVisualMode = config.enableVisualExploration ?? false;
            }
            catch { /* ignore */ }
        }
        const domTree = await domInspector.inspect(url, waitForSelector, storageState, includeIframes, loginMacro, sessionTimeout, enableVisualMode);
        // TASK-67: Record DOM scan for context compression
        ContextManager.getInstance().recordScan(url, domTree);
        const _domBudgetFooter = TokenBudgetService.getInstance().trackToolCall('inspect_page_dom', url, domTree);
        // TASK-52: ContextPulse — append compacted history when enough scans exist
        const _domHistory = ContextManager.getInstance().getCompactedHistory();
        const _domOutput = _domHistory
            ? `${domTree}\n\n${_domHistory}\n\n${_domBudgetFooter}`
            : `${domTree}\n\n${_domBudgetFooter}`;
        return textResult(truncate(_domOutput));
    }
});
server.registerTool("self_heal_test", {
    description: `WHEN TO USE: After a run_playwright_test fails. WHAT IT DOES: Analyzes Playwright Error DNA to determine if it's a SCRIPTING issue or an APPLICATION issue. HOW IT WORKS: Returns a targeted heal instruction telling the AI exactly which locator to fix and how to re-inspect the live DOM.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "errorDna": z.object({
            "code": z.enum(["Infrastructure", "Logic", "Transient"]),
            "causalChain": z.string(),
            "originalError": z.string(),
            "reason": z.string().optional()
        }).describe("The structured Error DNA object returned by the failing run_playwright_test output block."),
        "pageUrl": z.string().describe("Optional URL of the page being tested. If provided, the healer will call inspect_page_dom automatically to fetch fresh selectors.").optional(),
        "projectRoot": z.string().describe("Optional absolute path to the automation project for loading config timeouts.").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { errorDna, pageUrl, projectRoot } = args;
        let memoryPrompt = '';
        let sessionTimeout = 30000;
        if (projectRoot) {
            memoryPrompt = learningService.getKnowledgePromptInjection(projectRoot, { toolName: 'self_heal_test' });
            try {
                const config = mcpConfig.read(projectRoot);
                sessionTimeout = config.timeouts?.sessionStart ?? 30000;
            }
            catch { }
        }
        const rawError = errorDna.originalError || '';
        const analysis = selfHealer.analyzeFailure(rawError, memoryPrompt, 'default', projectRoot);
        let response = analysis.healInstruction;
        if (analysis.canAutoHeal && pageUrl) {
            const liveDom = await domInspector.inspect(pageUrl, undefined, undefined, undefined, undefined, sessionTimeout);
            response += `\n\n--- LIVE DOM SNAPSHOT (use these selectors to fix locators) ---\n${liveDom}`;
        }
        const _healHeader = `🔍 Error DNA [${errorDna.code.toUpperCase()}]:\n${errorDna.causalChain}\n\n`;
        return textResult(truncate(sanitizeOutput(_healHeader + response)));
    }
});
server.registerTool("validate_and_write", {
    description: `WHEN TO USE: After generating code content in memory. WHAT IT DOES: Writes the AI-generated test files to disk, runs them, and attempts auto-healing up to 3 times on failure. HOW IT WORKS: You pass the structured files to write as an array.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the test project."),
        "files": z.array(z.object({
            "path": z.string(),
            "content": z.string()
        })).describe("Array of files to write. Each must have a 'path' (relative) and 'content' (string)."),
        "jsonPageObjects": z.array(z.object({
            "className": z.string(),
            "path": z.string(),
            "extendsClass": z.string().optional(),
            "imports": z.array(z.string()).optional(),
            "locators": z.array(z.object({})).optional(),
            "methods": z.array(z.object({})).optional()
        })).describe("Optional structured JSON representations of Page Objects (bypasses raw TS formatting).").optional(),
        "pageUrl": z.string().describe("Optional URL used to re-inspect the DOM during self-healing retries.").optional(),
        "dryRun": z.boolean().describe("If true, audits and validates the files but skips writing to disk and testing. Returns a preview.").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        let { projectRoot, files, jsonPageObjects, pageUrl, dryRun } = args;
        let maxRetries = 3;
        let sessionTimeout = 30000;
        try {
            const config = mcpConfig.read(projectRoot);
            maxRetries = config.timeouts?.healingMax ?? 3;
            sessionTimeout = config.timeouts?.sessionStart ?? 30000;
        }
        catch { }
        const MAX_RETRIES = maxRetries;
        // BUG-02 FIX: If a previous session was exhausted or interrupted, the map
        // entry could be stale (already at MAX_RETRIES). A fresh top-level invocation
        // should always start at attempt 1, not continue from a prior stale count.
        const existingCount = retrySessionMap.get(projectRoot) ?? 0;
        const currentAttempt = existingCount >= MAX_RETRIES ? 1 : existingCount + 1;
        retrySessionMap.set(projectRoot, currentAttempt);
        // Phase 4.2: JSON-Structured Code Generation
        // Transpile incoming JSON POMs and inject them into standard files array
        if (jsonPageObjects && Array.isArray(jsonPageObjects)) {
            for (const jsonPom of jsonPageObjects) {
                if (jsonPom.className && jsonPom.path) {
                    const generatedContent = JsonToPomTranspiler.transpile(jsonPom);
                    files.push({
                        path: jsonPom.path,
                        content: generatedContent
                    });
                }
            }
        }
        // Phase 4.1: AST "Laziness" Scanner (Zero-Trust Enforcement)
        try {
            for (const f of files) {
                ASTScrutinizer.scrutinize(f.content, f.path);
            }
        }
        catch (astError) {
            return {
                content: [{
                        type: "text",
                        text: astError.message || String(astError)
                    }],
                isError: true
            };
        }
        // Check for Structural Brain God Node warnings
        const warnings = [];
        const brain = StructuralBrainService.getInstance();
        // Only do the pre-flight check if files exist
        if (files && Array.isArray(files)) {
            for (const f of files) {
                const w = brain.formatPreFlightWarning(path.join(projectRoot, f.path));
                if (w)
                    warnings.push(w);
            }
        }
        if (warnings.length > 0) {
            return {
                content: [{
                        type: "text",
                        text: `⚠️ STRUCTURAL BRAIN PRE-FLIGHT WARNING ⚠️\n\n${warnings.join('\n\n')}\n\nPlease acknowledge this risk and manually verify tests before committing changes. If you are certain, you must remove the god node check locally or proceed as instructed by the user.`
                    }],
                isError: true
            };
        }
        // Preview Mode explicitly skips touching the file system
        if (dryRun) {
            const writeResult = fileWriter.writeFiles(projectRoot, files, true);
            const secretViolations = auditGeneratedCode(files);
            let previewMsg = `✅ DRY RUN SUCCESS

Proposed files validated and structurally sound (NOT written):\n${writeResult.written.map((f) => `  - ${f}`).join('\n')}`;
            if (secretViolations.length > 0) {
                previewMsg += `

🔒 SECRET AUDIT WARNING:\n${secretViolations.join('\n')}`;
            }
            if (writeResult.warnings.length > 0) {
                previewMsg += `

⚠️ PATH WARNINGS:\n${writeResult.warnings.join('\n')}`;
            }
            return textResult(truncate(sanitizeOutput(previewMsg)));
        }
        let stagingDir;
        try {
            // File-State Race Guard (TASK-66)
            fileStateService.validateWriteState(projectRoot, files);
            // Phase 4.3: Atomic Staging (TASK-44)
            try {
                stagingDir = await stagingService.stageAndValidate(projectRoot, files);
            }
            catch (stagingError) {
                return {
                    content: [{
                            type: "text",
                            text: stagingError.message || String(stagingError)
                        }],
                    isError: true
                };
            }
            const writeResult = fileWriter.writeFiles(projectRoot, files, false);
            // Phase 35b: Audit generated code for hardcoded secrets before running tests
            const secretViolations = auditGeneratedCode(files);
            if (secretViolations.length > 0) {
                const warningBlock = [
                    `🔒 SECRET AUDIT: ${secretViolations.length} hardcoded credential(s) found in generated code!`,
                    '',
                    ...secretViolations,
                    '',
                    'The files were written but contain hardcoded secrets that should be replaced.',
                    'Please regenerate these files using process.env variables or getUser() helpers instead.'
                ].join('\n');
                // Return the warning but DON'T block — let the LLM see the issue and fix it
                return {
                    content: [{ type: "text", text: sanitizeOutput(warningBlock) }],
                    isError: true
                };
            }
            const runConfig = mcpConfig.read(projectRoot);
            // Scope the test run ONLY to the generated feature to save time and tokens
            let targetArg = undefined;
            const featureFile = files.find((f) => f.path.endsWith('.feature'));
            if (featureFile && featureFile.content) {
                const match = featureFile.content.match(/Feature:\s*(.+)/);
                if (match && match[1]) {
                    targetArg = `--grep "${match[1].trim()}"`;
                }
            }
            const runResult = await runner.runTests(projectRoot, targetArg, runConfig.timeouts?.testRun || 120000, runConfig.executionCommand);
            const lastOutput = runResult.output;
            if (runResult.passed) {
                retrySessionMap.delete(projectRoot);
                fileStateService.clearState(projectRoot);
                selfHealer.resetAttempts(projectRoot);
                return {
                    content: [{
                            type: "text",
                            text: sanitizeOutput(`✅ SUCCESS on attempt ${currentAttempt}/${MAX_RETRIES}!

All tests passed. Files written and validated:\n${writeResult.written.map((f) => `  - ${f}`).join('\n')}`)
                        }]
                };
            }
            const analysis = selfHealer.analyzeFailure(lastOutput, '', 'default', projectRoot);
            if (!analysis.canAutoHeal) {
                retrySessionMap.delete(projectRoot);
                return {
                    content: [{
                            type: "text", text: sanitizeOutput(`⚠️ AUTO-HEAL BLOCKED after attempt ${currentAttempt}/${MAX_RETRIES}

${analysis.healInstruction}`)
                        }]
                };
            }
            let healingContext = analysis.healInstruction;
            if (pageUrl) {
                try {
                    const dom = await domInspector.inspect(pageUrl, undefined, undefined, undefined, undefined, sessionTimeout);
                    healingContext += `

--- FRESH DOM SNAPSHOT (Attempt ${currentAttempt}) ---\n${dom}`;
                }
                catch (e) {
                    healingContext += `

[DOM re-inspection failed: ${e.message}]`;
                }
            }
            if (currentAttempt < MAX_RETRIES) {
                return {
                    content: [{
                            type: "text", text: sanitizeOutput(`🔄 ATTEMPT ${currentAttempt}/${MAX_RETRIES} FAILED — SELF-HEALING ACTIVATED

${healingContext}`)
                        }]
                };
            }
            retrySessionMap.delete(projectRoot);
            return {
                content: [{
                        type: "text", text: sanitizeOutput(`❌ ALL ${MAX_RETRIES} ATTEMPTS EXHAUSTED

${selfHealer.analyzeFailure(lastOutput, '', 'default', projectRoot).healInstruction}`)
                    }]
            };
        }
        finally {
            if (stagingDir) {
                stagingService.cleanup(stagingDir);
            }
        }
    }
});
server.registerTool("manage_env", {
    description: `WHEN TO USE: To discover existing keys or upsert new credentials. WHAT IT DOES: Reads, writes, or scaffolds the .env file. HOW IT WORKS: Pass action 'read', 'write', or 'scaffold'. Automatically manages .env.example

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the test project."),
        "action": z.enum(["read", "write", "scaffold"]).describe("The operation to perform."),
        "entries": z.array(z.object({
            "key": z.string(),
            "value": z.string()
        })).describe("For 'write' action: array of {key, value} env entries to upsert.").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot, action, entries } = args;
        if (action === "read") {
            const result = envManager.read(projectRoot);
            const summary = result.exists
                ? `Found .env at ${result.envFilePath} with ${result.keys.length} key(s):\n${result.keys.map((k) => `  - ${k}`).join('\n')}`
                : `No .env file found at ${result.envFilePath}. Run 'scaffold' to create one.`;
            return textResult(truncate(summary));
        }
        if (action === "write") {
            if (!entries || !Array.isArray(entries)) {
                throw McpErrors.invalidParameter("entries", "\'write\' action requires an \'entries\' array of {key, value} objects.");
            }
            const result = envManager.write(projectRoot, entries);
            const lines = [
                `✅ .env updated at ${result.envFilePath}`,
                result.written.length > 0 ? `\nWritten:\n${result.written.map((k) => `  + ${k}`).join('\n')}` : '',
                result.skipped.length > 0 ? `\nSkipped (already set or secret placeholder):\n${result.skipped.map((k) => `  ~ ${k}`).join('\n')}` : '',
                `\n.env.example updated. Remember to commit .env.example but NOT .env.`,
            ];
            return textResult(truncate(lines.filter(Boolean).join('')));
        }
        if (action === "scaffold") {
            const result = envManager.scaffold(projectRoot);
            return {
                content: [{
                        type: "text",
                        text: `✅ .env scaffolded at ${result.envFilePath}

Default keys written:\n${result.written.map((k) => `  + ${k}`).join('\n')}

Next steps:\n  1. Open .env and replace \"***FILL_IN***\" values with real credentials.\n  2. Commit .env.example (already created) but never .env.\n  3. Use process.env.BASE_URL in your Page Objects to reference the base URL.`
                    }]
            };
        }
        throw McpErrors.invalidParameter("action", `Unknown manage_env action: ${action}. Valid values: read, write, scaffold`);
    }
});
server.registerTool("setup_project", {
    description: `WHEN TO USE: First time setting up a new TestForge environment. WHAT IT DOES: Bootstraps an empty directory into a fully configured Playwright-BDD project. HOW IT WORKS: Creates necessary structure, installs npm packages, and writes config files.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the new or empty project directory.")
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot } = args;
        const resultStr = await projectSetup.setup(projectRoot);
        const result = JSON.parse(resultStr);
        if (result.phase === 1) {
            return textResult(truncate(resultStr));
        }
        const cfg = mcpConfig.scaffold(projectRoot);
        const userResults = userStore.scaffold(projectRoot, cfg.environments);
        const envCount = Object.values(userResults).reduce((acc, r) => acc + r.added.length, 0);
        const setupMsg = result.message +
            `\n\n✅ mcp-config.json configured!` +
            `\n✅ User stores created for environments: ${cfg.environments.join(', ')} (${envCount} roles each)` +
            `\n   Fill in passwords in test-data/users.{env}.json — those files are git-ignored for safety.`;
        const responseText = JSON.stringify({
            action: "PROJECT_SCAFFOLDED",
            output: setupMsg,
            unfilledFields: result.unfilledFields,
            hint: "Project is scaffolded. Proceed to 'manage_config' or 'manage_env' to customize."
        }, null, 2);
        return textResult(truncate(responseText));
    }
});
server.registerTool("repair_project", {
    description: `WHEN TO USE: After an interrupted setup. WHAT IT DOES: Repair and restore missing baseline files safely. HOW IT WORKS: Generates files that are missing without overwriting existing ones.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the project root.")
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot } = args;
        const repairResult = await maintenance.repairProject(projectRoot);
        return textResult(truncate(repairResult));
    }
});
server.registerTool("summarize_suite", {
    description: `WHEN TO USE: To get an overview of the current test suite. WHAT IT DOES: Reads all .feature files and returns a plain-English summary. HOW IT WORKS: Provides tag breakdown and ready-to-run selective test commands.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the test project.")
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot } = args;
        const report = suiteSummary.summarize(projectRoot);
        const responseText = JSON.stringify({
            action: "SUITE_SUMMARIZED",
            summary: report.plainEnglishSummary,
            hint: "Use 'run_playwright_test' with specificTestArgs to run any listed tests."
        }, null, 2);
        return textResult(truncate(responseText));
    }
});
server.registerTool("manage_config", {
    description: `WHEN TO USE: To read, write, preview, or scaffold project configurations. WHAT IT DOES: Interacts with mcp-config.json. HOW IT WORKS: Pass the action and optional partial config. ACTIONS: 'read' returns raw on-disk content; 'write' deep-merges patch and updates file; 'preview' shows what 'write' would produce WITHOUT touching disk; 'scaffold' creates the file if missing.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string(),
        "action": z.enum(["read", "write", "scaffold", "preview"]).describe("DEPRECATED: Use operation instead.").optional(),
        "operation": z.enum(["read", "write", "scaffold", "preview", "inject_app", "set_credentials"]).describe("The operation to perform.").optional(),
        "credentials": z.record(z.string(), z.string()).describe("Records to write to .env (for 'set_credentials' or 'write').").optional(),
        "appPath": z.string().describe("Path to inject (for 'inject_app').").optional(),
        "config": z.object({}).describe("Partial McpConfig to merge in (for 'write'/'scaffold'/'preview'). Missing keys use defaults.").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot, config: configPatch, credentials, appPath } = args;
        const operation = args.operation || args.action;
        // TASK-12: 'read' returns raw on-disk content — no defaults injected.
        // Callers that need defaults should use the service's read() internally;
        // this action is for inspecting what the user actually stored.
        if (operation === "read") {
            const raw = mcpConfig.readRaw(projectRoot);
            if (raw === null) {
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                status: "no_config",
                                message: `mcp-config.json not found at ${projectRoot}. Run 'scaffold' to create it.`,
                                defaults: DEFAULT_CONFIG
                            }, null, 2)
                        }]
                };
            }
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "ok",
                            source: "disk",
                            lastWrittenAt: mcpConfig.lastWrittenAt?.toISOString() ?? "unknown (pre-session write)",
                            config: raw
                        }, null, 2)
                    }]
            };
        }
        // TASK-12: 'preview' — computes merged result WITHOUT touching disk.
        if (operation === "preview") {
            if (!configPatch)
                throw McpErrors.invalidParameter("config", "\'preview\' action requires a \'config\' object.");
            const previewed = mcpConfig.preview(projectRoot, configPatch);
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "preview",
                            message: "This is a dry-run. No files were written.",
                            wouldProduce: previewed
                        }, null, 2)
                    }]
            };
        }
        if (operation === "scaffold") {
            const written = mcpConfig.scaffold(projectRoot, configPatch ?? {});
            return {
                content: [{
                        type: "text",
                        text: `✅ mcp-config.json scaffolded at ${projectRoot}/mcp-config.json\n` +
                            `✅ mcp-config.example.json created (safe to commit).\n\n` +
                            `Current configuration:\n${JSON.stringify(written, null, 2)}`
                    }]
            };
        }
        if (operation === "inject_app") {
            throw McpErrors.invalidParameter("operation", "'inject_app' is not supported in TestForge. Update baseUrl in .env using set_credentials instead.");
        }
        if (operation === "set_credentials") {
            if (!credentials)
                throw McpErrors.invalidParameter("credentials", "'set_credentials' requires a 'credentials' object");
            const entries = Object.entries(credentials).map(([k, v]) => ({ key: k, value: String(v) }));
            envManager.write(projectRoot, entries);
            return { content: [{ type: "text", text: `✅ Saved ${entries.length} credential(s) to .env` }] };
        }
        if (operation === "write") {
            if (credentials && Object.keys(credentials).length > 0) {
                envManager.write(projectRoot, Object.entries(credentials).map(([k, v]) => ({ key: k, value: String(v) })));
            }
            let writePatch = configPatch || {};
            const updated = mcpConfig.write(projectRoot, writePatch);
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "ok",
                            lastWrittenAt: mcpConfig.lastWrittenAt?.toISOString(),
                            config: updated
                        }, null, 2)
                    }]
            };
        }
        throw McpErrors.invalidParameter("operation", `Unknown manage_config operation: ${operation}. Valid values: read, write, preview, scaffold, inject_app, set_credentials`);
    }
});
server.registerTool("manage_users", {
    description: `WHEN TO USE: Manage multi-environment test users. WHAT IT DOES: Modifies users.{env}.json. HOW IT WORKS: Replaces specific values for accounts.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string(),
        "action": z.enum(["list", "add-role", "scaffold"]),
        "environment": z.string().describe("Target environment (e.g. 'staging'). Defaults to currentEnvironment in mcp-config.json.").optional(),
        "roles": z.array(z.string()).describe("Role names to add (for 'add-role'), e.g. ['admin', 'readonly'].").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot, action, roles } = args;
        const cfg = mcpConfig.read(projectRoot);
        const env = args.environment ?? cfg.currentEnvironment;
        if (action === "list") {
            const storeResult = userStore.read(projectRoot, env);
            if (!storeResult.exists) {
                return { content: [{ type: "text", text: `No user store found for environment "${env}". Run 'scaffold' first.` }] };
            }
            const listLines = [
                `👥 Users for environment: ${env} (${storeResult.filePath})`,
                `   Roles: ${storeResult.roles.join(', ')}`,
                '',
                ...storeResult.roles.map((role) => {
                    const u = storeResult.users[role];
                    const pwdStatus = u.password === '***FILL_IN***' ? '⚠️ NOT SET' : '✅ set';
                    return `   • ${role}: ${u.username} — password: ${pwdStatus}`;
                })
            ];
            return textResult(truncate(listLines.join('\n')));
        }
        if (action === "scaffold") {
            const results = userStore.scaffold(projectRoot, cfg.environments);
            const scaffoldLines = [`✅ User stores scaffolded for all environments: ${cfg.environments.join(', ')}`];
            for (const [e, r] of Object.entries(results)) {
                scaffoldLines.push(`   ${e}: added=${r.added.join(', ') || 'none'}, skipped=${r.skipped.join(', ') || 'none'}`);
            }
            scaffoldLines.push('', `📄 user-helper.ts generated in test-data/ — Page Objects can now call: getUser('admin')`);
            scaffoldLines.push(`⚠️  Fill in passwords in test-data/users.{env}.json — those files are already in .gitignore.`);
            return textResult(truncate(scaffoldLines.join('\n')));
        }
        if (action === "add-role") {
            if (!roles || !Array.isArray(roles) || roles.length === 0) {
                throw McpErrors.invalidParameter("roles", "\'add-role\' action requires a \'roles\' array.");
            }
            const addResult = userStore.addRoles(projectRoot, env, roles);
            userStore.generateUserHelper(projectRoot, userStore.read(projectRoot, env).roles);
            const addLines = [
                `✅ Roles updated for environment: ${env}`,
                addResult.added.length > 0 ? `   Added: ${addResult.added.join(', ')}` : '',
                addResult.skipped.length > 0 ? `   Skipped (already exist): ${addResult.skipped.join(', ')}` : '',
                '',
                `⚠️  Open ${addResult.filePath} and replace ***FILL_IN*** values with real credentials.`,
            ].filter(Boolean);
            return textResult(truncate(addLines.join('\n')));
        }
        throw McpErrors.invalidParameter("action", `Unknown manage_users action: ${action}. Valid values: list, add-role, scaffold`);
    }
});
server.registerTool("migrate_test", {
    description: `WHEN TO USE: To port legacy scripts. WHAT IT DOES: Translates legacy Java/Python/JS Selenium code into strict TypeScript Playwright-BDD. HOW IT WORKS: Returns a rigid system prompt back.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "legacyCode": z.string().describe("The raw legacy Selenium code snippet or file content."),
        "sourceDialect": z.enum(["java", "python", "javascript", "csharp", "auto"]).describe("The language/dialect of the legacy code.")
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot, legacyCode, sourceDialect } = args;
        const codebaseContext = await analyzer.analyze(projectRoot);
        const memoryPrompt = learningService.getKnowledgePromptInjection(projectRoot, { toolName: 'migrate_test' }, codebaseContext.mcpLearnDirectives);
        const systemPrompt = seleniumMigrator.generateMigrationPrompt(projectRoot, legacyCode, sourceDialect, codebaseContext, memoryPrompt);
        return textResult(truncate(systemPrompt));
    }
});
server.registerTool("suggest_refactorings", {
    description: `WHEN TO USE: To keep the codebase clean. WHAT IT DOES: Analyzes the codebase to find duplicate step definitions and unused Page Object methods. HOW IT WORKS: Returns a structured JSON/Markdown plan for pruning and consolidating the test suite.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project.")
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot } = args;
        await maintenance.ensureUpToDate(projectRoot);
        const analysis = await analyzer.analyze(projectRoot);
        const report = refactoringService.generateRefactoringSuggestions(analysis);
        return textResult(truncate(sanitizeOutput(report)));
    }
});
server.registerTool("generate_test_data_factory", {
    description: `WHEN TO USE: To mock backend or entity data. WHAT IT DOES: Generates strict system instructions to help the LLM create a Playwright test fixture. HOW IT WORKS: Returns a prompt to create a typed Faker.js data factory.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "entityName": z.string().describe("Name of the entity being mocked (e.g., 'User', 'Product')."),
        "schemaDefinition": z.string().describe("Text description, JSON schema, or TypeScript interface defining the fields of the entity.")
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { entityName, schemaDefinition } = args;
        const systemPrompt = fixtureDataService.generateFixturePrompt(entityName, schemaDefinition);
        return textResult(truncate(systemPrompt));
    }
});
server.registerTool("update_visual_baselines", {
    description: `WHEN TO USE: To resolve visual regression failures. WHAT IT DOES: Executes the Playwright test suite with the --update-snapshots flag. HOW IT WORKS: Rebaselines any toHaveScreenshot image mismatches natively.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "specificTestArgs": z.string().describe("Optional arguments like a specific feature file path or project flag.").optional(),
        "tags": z.string().describe("Optional: filter by tag(s), e.g. '@smoke' or '@regression'. Passed as --grep to Playwright.").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot, specificTestArgs, tags } = args;
        await maintenance.ensureUpToDate(projectRoot);
        const config = mcpConfig.read(projectRoot);
        const grepArg = tags ? `--grep "${tags}"` : '';
        const baselineArg = '--update-snapshots';
        const combinedArgs = [specificTestArgs, grepArg, baselineArg].filter(Boolean).join(' ');
        const result = await runner.runTests(projectRoot, combinedArgs, config.timeouts?.testRun || 120000, config.executionCommand);
        return textResult(truncate(sanitizeOutput(result.output)));
    }
});
server.registerTool("request_user_clarification", {
    description: `WHEN TO USE: CRITICAL: Call this tool when you encounter an architectural ambiguity or missing requirement. WHAT IT DOES: Halts execution to prompt the human user with your question. HOW IT WORKS: Returns a strict SYSTEM HALT directive and waits for their answer.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "question": z.string().describe("The exact question you want to ask the user."),
        "options": z.array(z.string()).describe("Optional: a list of suggested choices to make it easier for the user to reply.").optional(),
        "context": z.string().describe("A brief explanation of WHY you are blocked and need clarification.")
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { question, options, context } = args;
        // Route through Questioner.clarify() — throws ClarificationRequired which is
        // caught by the global handler below and serialised as structured JSON.
        // This is the canonical AppForge pattern: throw → catch → structured response.
        Questioner.clarify(question, context, options);
    }
});
server.registerTool("train_on_example", {
    description: `WHEN TO USE: After manually correcting an AI generation error. WHAT IT DOES: Injects custom team knowledge or learned coding fixes into the persistent MCP memory. HOW IT WORKS: Ensures the AI does not repeat the same scripting mistake in future generations.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "issuePattern": z.string().describe("The recurring error or structural ambiguity (e.g., 'Locating shadow root elements on login page', 'Missing await on dynamic loader')."),
        "solution": z.string().describe("The exact code snippet or strategy required to overcome the issue."),
        "tags": z.array(z.string()).describe("Optional module or feature tags.").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot, issuePattern, solution, tags } = args;
        const rule = learningService.learn(projectRoot, issuePattern, solution, tags || []);
        const responseText = `Successfully learned new rule!\nSaved to mcp-learning.json\nPattern: ${rule.pattern}\nSolution: ${rule.solution}`;
        return textResult(truncate(sanitizeOutput(responseText)));
    }
});
server.registerTool("generate_ci_pipeline", {
    description: `WHEN TO USE: To finalize a project setup on Github/Gitlab. WHAT IT DOES: Generates a fully-configured CI/CD pipeline template. HOW IT WORKS: Writes directly to disk the standard CI yaml.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "provider": z.string().describe("The CI/CD provider: 'github', 'gitlab', or 'jenkins'."),
        "runOnPush": z.boolean().describe("Whether to trigger the pipeline on git push/PR."),
        "runOnSchedule": z.string().describe("Optional cron schedule (e.g., '0 0 * * *' for nightly).").optional(),
        "nodeVersion": z.string().describe("Optional Node version (defaults to '20').").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot, provider, runOnPush, runOnSchedule, nodeVersion } = args;
        const targetPath = pipelineService.generatePipeline(projectRoot, {
            provider,
            runOnPush,
            runOnSchedule,
            nodeVersion
        });
        return {
            content: [{
                    type: "text", text: `✅ Pipeline successfully generated at:\n  - ${targetPath}

Ensure you push this file to your repository and setup branch protections if applicable.`
                }]
        };
    }
});
server.registerTool("export_jira_bug", {
    description: `WHEN TO USE: When a failed test needs tracking. WHAT IT DOES: Generates a Jira-formatted bug report from a failed Playwright test. HOW IT WORKS: Incorporates file paths to the Playwright Trace and Video recordings.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "testName": z.string().describe("The name of the failing test."),
        "rawError": z.string().describe("The Playwright error output.")
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { testName, rawError } = args;
        const bugReport = analyticsService.generateJiraBugPrompt(testName, rawError);
        return textResult(truncate(bugReport));
    }
});
server.registerTool("export_team_knowledge", {
    description: `WHEN TO USE: To share the AI's internal knowledge base. WHAT IT DOES: Exports the mcp-learning.json brain into a human-readable Markdown file. HOW IT WORKS: Writes to a document so the team can review autonomously learned rules.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot } = args;
        // Delegate to LearningService.exportToMarkdown() — single source of truth.
        const md = learningService.exportToMarkdown(projectRoot);
        const docsDir = path.join(projectRoot, 'docs');
        if (!fs.existsSync(docsDir))
            fs.mkdirSync(docsDir, { recursive: true });
        const filePath = path.join(docsDir, 'team-knowledge.md');
        fs.writeFileSync(filePath, md, 'utf8');
        return {
            content: [{
                    type: "text",
                    text: `✅ Team knowledge exported to ${filePath}.\nCommit this file to share learned rules with the team.`
                }]
        };
    }
});
server.registerTool("analyze_coverage_gaps", {
    description: `WHEN TO USE: After generating coverage reports to find specific test gaps. WHAT IT DOES: Analyzes istanbul/v8 LCOV coverage metrics to identify deeply untested branches. HOW IT WORKS: Returns strict LLM instructions to generate the missing Playwright-BDD features.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot } = args;
        const systemPrompt = analyticsService.analyzeCoverageGaps(projectRoot);
        return textResult(truncate(systemPrompt));
    }
});
server.registerTool("start_session", {
    description: `WHEN TO USE: Start of interactive or multi-step tasks. WHAT IT DOES: Starts a persistent Playwright browser session in the background. HOW IT WORKS: Avoids launching a new browser per action. Returns context.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "operation": z.enum(["start", "stop"]).describe("The operation to perform (start or stop). Default is start.").optional(),
        "headless": z.boolean().describe("Whether to hide the browser UI. Default: true (headless).").optional(),
        "storageState": z.string().describe("Path to a storageState JSON (cookies/auth).").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { operation = 'start' } = args;
        if (operation === 'stop') {
            const result = await sessionService.endSession();
            return textResult(truncate(result));
        }
        const result = await sessionService.startSession(args);
        const responseText = JSON.stringify({
            action: "SESSION_STARTED",
            status: "SUCCESS",
            details: result,
            hint: "Session is active. You can now use 'navigate_session' or 'verify_selector'."
        }, null, 2);
        return textResult(truncate(responseText));
    }
});
// End session folded into start_session
server.registerTool("create_test_atomically", {
    title: "Create Test Atomically",
    description: `WORKFLOW ORCHESTRATOR: Validate → Write test files in one atomic call. Use when you have generated test files and want to write them without manual validation chaining. Validates TypeScript/Gherkin syntax, then writes to disk atomically. Returns: { success: boolean, filesWritten: string[] }. NEXT: run_playwright_test to verify.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
    inputSchema: z.object({
        projectRoot: z.string(),
        generatedFiles: z.array(z.object({
            path: z.string(),
            content: z.string()
        }))
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    try {
        const result = await orchestrationService.createTestAtomically(args.projectRoot, args.generatedFiles);
        return textResult(JSON.stringify(result, null, 2));
    }
    catch (err) {
        const { toMcpErrorResponse } = await import('./types/ErrorSystem.js');
        return toMcpErrorResponse(err, 'create_test_atomically');
    }
});
server.registerTool("heal_and_verify_atomically", {
    title: "Heal and Verify Atomically",
    description: `WORKFLOW ORCHESTRATOR: Self-heal → Verify → Learn in one atomic call. Use when a test fails with a bad selector to fix it without manual chaining. Verifies the candidate selector on the live session and auto-trains the learning system. Returns: { healedSelector, verified, learned, confidence }.

NOTE: Requires active Playwright session (call start_session first). Provide candidateSelector from self_heal_test output.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
    inputSchema: z.object({
        projectRoot: z.string(),
        error: z.string().describe("Test failure error message"),
        xml: z.string().describe("Current DOM snapshot or page URL context"),
        oldSelector: z.string().optional().describe("The original failed selector (for better learning)"),
        candidateSelector: z.string().describe("The proposed replacement selector to verify")
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    try {
        const result = await orchestrationService.healAndVerifyAtomically(args.projectRoot, args.error, args.xml, args.oldSelector, args.candidateSelector);
        return textResult(JSON.stringify(result, null, 2));
    }
    catch (err) {
        const { toMcpErrorResponse } = await import('./types/ErrorSystem.js');
        return toMcpErrorResponse(err, 'heal_and_verify_atomically');
    }
});
server.registerTool("navigate_session", {
    description: `WHEN TO USE: To re-route an active session context. WHAT IT DOES: Navigates the persistent session to a target URL. HOW IT WORKS: Invokes Playwright page.goto() live.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "url": z.string().describe("The URL to navigate to.")
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { url } = args;
        const result = await sessionService.navigate(url);
        return textResult(truncate(result));
    }
});
server.registerTool("verify_selector", {
    description: `WHEN TO USE: To proactively guarantee loactors before writing. WHAT IT DOES: TESTS a CSS/XPath selector LIVE in the persistent browser without running a full script. HOW IT WORKS: Ensures locators are valid, visible, and enabled prior to Page Object saving. Pass autoTrain:true to auto-learn the fix after a successful heal.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "selector": z.string().describe("The raw generic selector (e.g. '.submit-btn' or '//button')."),
        "oldSelector": z.string().describe("Optional: the original failed selector, used to record a heal in mcp-learning.json when autoTrain is true.").optional(),
        "projectRoot": z.string().describe("Optional: absolute path to project root. Required for autoTrain and DNA tracking.").optional(),
        "autoTrain": z.boolean().describe("If true, on a successful selector verification, automatically records the fix (oldSelector -> selector) in mcp-learning.json via LearningService.").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { selector, oldSelector, projectRoot, autoTrain } = args;
        const result = await sessionService.verifySelector(selector);
        // TASK-61: Track DNA metadata for successfully verified selectors
        if (projectRoot) {
            try {
                // Best-effort: extract basic metadata from the selector string itself
                // (full tag/hierarchy tracking requires live DOM, handled by DomInspectorService)
                dnaTracker.track(projectRoot, selector, '', '', '', '');
            }
            catch { /* non-fatal */ }
        }
        // TASK-41: Auto-learning — record heal on success if autoTrain requested
        if (autoTrain && projectRoot && oldSelector) {
            selfHealer.notifyHealSuccess(projectRoot, oldSelector, selector);
        }
        return textResult(truncate(result));
    }
});
server.registerTool("execute_sandbox_code", {
    description: `WHEN TO USE: FOR ALL RESEARCH AND ANALYSIS tasks (🚀 TURBO MODE RECOMMENDED). WHAT IT DOES: Execute a JavaScript snippet inside a secure V8 sandbox to analyze code, find existing steps, or inspect DOMs. HOW IT WORKS: The script has access to forge.api.* and returns only the filtered data you need.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "script": z.string().describe("The JavaScript code to execute. Use `return` to send a value back. Use `await forge.api.*()` to call server services. Keep scripts focused and small."),
        "timeoutMs": z.number().describe("Optional execution timeout in milliseconds. Default: 10000 (10s).").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { script, timeoutMs } = args;
        // Build the API registry — expose safe server services to the sandbox
        const apiRegistry = {
            inspectDom: async (url) => {
                return await domInspector.inspect(url);
            },
            analyzeCodebase: async (projectRoot) => {
                return await analyzer.analyze(projectRoot);
            },
            runTests: async (projectRoot) => {
                const config = mcpConfig.read(projectRoot);
                return await runner.runTests(projectRoot, undefined, config.timeouts?.testRun || 120000);
            },
            readFile: async (filePath, projectRoot) => {
                const resolvedRoot = path.resolve(projectRoot || process.cwd());
                const resolvedFile = path.resolve(resolvedRoot, filePath);
                if (!resolvedFile.startsWith(resolvedRoot + path.sep) && resolvedFile !== resolvedRoot) {
                    throw McpErrors.permissionDenied(filePath);
                }
                if (!fs.existsSync(resolvedFile)) {
                    const enhanced = FileSuggester.enhanceError(resolvedFile);
                    throw McpErrors.fileNotFound(enhanced, 'SandboxEngine.readFile');
                }
                const content = FileGuard.readTextFileSafely(resolvedFile);
                fileStateService.recordRead(resolvedRoot, resolvedFile, content);
                return content;
            },
            getConfig: async (projectRoot) => {
                return mcpConfig.read(projectRoot);
            },
            summarizeSuite: async (projectRoot) => {
                return suiteSummary.summarize(projectRoot);
            },
            listFiles: async (dir, options, projectRoot) => {
                const MAX_LIST_ITEMS = 5000;
                const resolvedRoot = projectRoot ? path.resolve(projectRoot) : process.cwd();
                const absDir = path.resolve(resolvedRoot, dir);
                if (!absDir.startsWith(resolvedRoot + path.sep) && absDir !== resolvedRoot) {
                    throw McpErrors.permissionDenied(dir);
                }
                if (!fs.existsSync(absDir)) {
                    throw McpErrors.fileNotFound(absDir);
                }
                const walk = (base, rel = '') => {
                    const results = [];
                    const entries = fs.readdirSync(base, { withFileTypes: true });
                    for (const entry of entries) {
                        const name = entry.name;
                        const full = path.join(base, name);
                        const relPath = rel ? path.join(rel, name) : name;
                        const stat = fs.lstatSync(full);
                        if (stat.isSymbolicLink())
                            continue;
                        if (stat.isFile())
                            results.push(relPath);
                        else if (stat.isDirectory() && options?.recursive) {
                            results.push(...walk(full, relPath));
                        }
                        if (results.length >= MAX_LIST_ITEMS)
                            break;
                    }
                    return results;
                };
                let items = options?.recursive ? walk(absDir, '') : fs.readdirSync(absDir).filter(n => {
                    try {
                        const s = fs.lstatSync(path.join(absDir, n));
                        return !s.isSymbolicLink();
                    }
                    catch {
                        return false;
                    }
                });
                if (options?.glob) {
                    // Minimal glob matcher using regex to avoid adding external dependencies dynamically
                    const globToRegex = (globPattern) => {
                        const escaped = globPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
                        const replaced = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
                        return new RegExp(`^${replaced}$`);
                    };
                    const regex = globToRegex(options.glob);
                    items = items.filter(item => regex.test(path.basename(item)));
                }
                return items.slice(0, MAX_LIST_ITEMS);
            },
            searchFiles: async (pattern, dir, options) => {
                const MAX_SEARCH_FILES = 1000;
                const MAX_SEARCH_RESULTS = 500;
                const MAX_PARSE_FILE_BYTES = 1024 * 1024; // 1MB
                const pRoot = options?.projectRoot ? path.resolve(options.projectRoot) : process.cwd();
                if (/(?:\([^)]*\+[^)]*\)\+)/.test(pattern) || pattern.length > 200) {
                    throw McpErrors.invalidParameter("pattern", "Regex rejected: potential ReDoS");
                }
                let regex;
                try {
                    regex = new RegExp(pattern, 'g');
                }
                catch {
                    throw McpErrors.invalidParameter("pattern", "Invalid regex pattern");
                }
                // A bit hacky but we call the localized listFiles directly
                const resolvedRoot = pRoot;
                const absDir = path.resolve(resolvedRoot, dir);
                if (!absDir.startsWith(resolvedRoot + path.sep) && absDir !== resolvedRoot) {
                    throw McpErrors.permissionDenied("");
                }
                const walk = (base, rel = '') => {
                    const results = [];
                    const entries = fs.readdirSync(base, { withFileTypes: true });
                    for (const entry of entries) {
                        const name = entry.name;
                        const full = path.join(base, name);
                        const relPath = rel ? path.join(rel, name) : name;
                        if (fs.lstatSync(full).isSymbolicLink())
                            continue;
                        if (fs.statSync(full).isFile())
                            results.push(relPath);
                        else if (fs.statSync(full).isDirectory())
                            results.push(...walk(full, relPath));
                        if (results.length >= MAX_SEARCH_FILES)
                            break;
                    }
                    return results;
                };
                let files = walk(absDir, '');
                if (options?.filePattern) {
                    const escaped = options.filePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
                    const rx = new RegExp(`^${escaped}$`);
                    files = files.filter(f => rx.test(path.basename(f)));
                }
                const hits = [];
                let scanned = 0;
                for (const fileRel of files.slice(0, MAX_SEARCH_FILES)) {
                    const fullPath = path.join(absDir, fileRel);
                    try {
                        const stats = fs.statSync(fullPath);
                        if (stats.size > MAX_PARSE_FILE_BYTES)
                            continue;
                        const content = FileGuard.readTextFileSafely(fullPath);
                        const lines = content.split('\n');
                        for (let i = 0; i < lines.length; i++) {
                            const lineContent = lines[i];
                            if (lineContent !== undefined && regex.test(lineContent)) {
                                hits.push({ file: path.join(dir, fileRel), line: i + 1, text: lineContent });
                                regex.lastIndex = 0;
                                if (hits.length >= MAX_SEARCH_RESULTS)
                                    break;
                            }
                        }
                        scanned++;
                        if (hits.length >= MAX_SEARCH_RESULTS)
                            break;
                    }
                    catch { }
                    if (scanned >= MAX_SEARCH_FILES)
                        break;
                }
                return hits.slice(0, MAX_SEARCH_RESULTS);
            },
            parseAST: async (filePath, options) => {
                const ts = await import('typescript').catch(() => null);
                if (!ts)
                    throw McpErrors.projectValidationFailed("typescript package not available");
                const MAX_PARSE_FILE_BYTES = 1024 * 1024; // 1MB
                const projectRoot = options?.projectRoot ? path.resolve(options.projectRoot) : process.cwd();
                const absPath = path.resolve(projectRoot, filePath);
                if (!absPath.startsWith(projectRoot + path.sep) && absPath !== projectRoot) {
                    throw McpErrors.permissionDenied(filePath);
                }
                if (!fs.existsSync(absPath)) {
                    throw McpErrors.fileNotFound(absPath);
                }
                const stats = fs.statSync(absPath);
                if (stats.size > MAX_PARSE_FILE_BYTES) {
                    throw new McpError(`File too large: ${absPath}`, McpErrorCode.FILE_TOO_LARGE);
                }
                const content = FileGuard.readTextFileSafely(absPath);
                const sourceFile = ts.createSourceFile(absPath, content, ts.ScriptTarget.Latest, true);
                if (options?.extractSignatures) {
                    const signatures = [];
                    const visit = (node) => {
                        if (ts.isFunctionDeclaration(node) && node.name) {
                            signatures.push({
                                name: node.name.text,
                                type: 'function',
                                signature: (node.getText ? node.getText() : '').split('{')[0]?.trim() || ''
                            });
                        }
                        else if (ts.isClassDeclaration(node) && node.name) {
                            signatures.push({
                                name: node.name.text,
                                type: 'class',
                                signature: `class ${node.name.text}`
                            });
                        }
                        ts.forEachChild(node, visit);
                    };
                    visit(sourceFile);
                    return signatures;
                }
                return sourceFile;
            },
            getEnv: async (key) => {
                const SAFE_ENV_VARS = [
                    'NODE_ENV',
                    'CI',
                    'GITHUB_ACTIONS',
                    'BASE_URL',
                    'PLATFORM'
                ];
                if (!SAFE_ENV_VARS.includes(key)) {
                    throw McpErrors.permissionDenied(key, `Environment variable "${key}" is not on the allowlist.`);
                }
                return process.env[key] ?? null;
            }
        };
        const sandboxResult = await executeSandbox(script, apiRegistry, { timeoutMs });
        if (sandboxResult.success) {
            const parts = [];
            if (sandboxResult.logs.length > 0) {
                parts.push(`[Sandbox Logs]\n${sandboxResult.logs.join('\n')}`);
            }
            if (sandboxResult.result != null) {
                parts.push(typeof sandboxResult.result === 'string'
                    ? sandboxResult.result
                    : JSON.stringify(sandboxResult.result, null, 2));
            }
            else if (sandboxResult.logs.length === 0) {
                parts.push('⚠️ Sandbox executed successfully but returned no data. Ensure your script uses `return <value>` to send results back.');
            }
            parts.push(`\n⏱️ Executed in ${sandboxResult.durationMs}ms`);
            return textResult(truncate(sanitizeOutput(parts.join('\\n\\n'))));
        }
        else {
            return {
                content: [{ type: "text", text: `❌ SANDBOX ERROR: ${sandboxResult.error}\\n\\nLogs:\\n${sandboxResult.logs.join('\\n')}\\n\\n⏱️ Failed after ${sandboxResult.durationMs}ms` }],
                isError: true,
            };
        }
    }
});
server.registerTool("check_environment", {
    description: `WHEN TO USE: Pre-flight check. WHAT IT DOES: Verifies Node.js version, Playwright installation, browsers, and configs. HOW IT WORKS: Returns the environment readiness state as structured JSON.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string(),
        "baseUrl": z.string().describe("Optional URL to test reachability. If omitted, reads BASE_URL from .env").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot, baseUrl } = args;
        const report = await envCheckService.check(projectRoot, baseUrl);
        const failCount = report.failCount !== undefined ? report.failCount : 0;
        const warnCount = report.warnCount !== undefined ? report.warnCount : 0;
        const responseText = JSON.stringify({
            action: "ENVIRONMENT_CHECK_COMPLETED",
            summary: report.summary || String(report),
            ready: failCount === 0,
            statusCounts: { fail: failCount, warn: warnCount },
            hint: failCount === 0 ? "Environment is ready. Proceed to 'setup_project' or 'generate'." : "Environment issues detected. Check the summary."
        }, null, 2);
        return textResult(truncate(responseText));
    }
});
server.registerTool("audit_locators", {
    description: `WHEN TO USE: To verify locator health across the project. WHAT IT DOES: Scans Page Objects and flags brittle strategies. HOW IT WORKS: Returns a Markdown health report.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string(),
        "pagesRoot": z.string().describe("Relative path to the pages directory. Defaults to 'pages'").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot, pagesRoot } = args;
        const report = await locatorAuditService.audit(projectRoot, pagesRoot);
        return textResult(truncate(report.markdownReport));
    }
});
server.registerTool("audit_utils", {
    description: `WHEN TO USE: To check for missing Playwright API surface wrappers. WHAT IT DOES: Scans the utils layer to report missing helper methods. HOW IT WORKS: Custom-wrapper-aware, counts implemented actions.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string(),
        "customWrapperPackage": z.string().describe("Optional: package name or path to a custom BasePage/wrapper. E.g. '@myorg/playwright-helpers'. Methods from this package are counted as already present.").optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    {
        const { projectRoot, customWrapperPackage } = args;
        const result = await utilAuditService.audit(projectRoot, customWrapperPackage);
        const lines = [
            `## 🔧 Playwright Utils Coverage Report`,
            `**Coverage**: ${result.coveragePercent}% (${result.present.length}/${result.present.length + result.missing.length} methods)`,
            result.customWrapperNote ? `\n${result.customWrapperNote}` : '',
            result.coveredByWrapper.length > 0
                ? `\n**Covered by custom wrapper**: ${result.coveredByWrapper.join(', ')}`
                : '',
            result.missing.length === 0
                ? '\n✅ All standard Playwright helper methods are implemented!'
                : `\n### Missing Methods (${result.missing.length}):\n` +
                    result.missing.map(m => `- \`${m.suggestedUtilClass}.${m.method}()\` [${m.category}] — ${m.description}`).join('\n'),
            result.actionableSuggestions.length > 0
                ? `\n### Actionable Suggestions:\n${result.actionableSuggestions.join('\n')}`
                : ''
        ].filter(Boolean).join('\n');
        return textResult(truncate(lines));
    }
});
server.registerTool("analyze_coverage", {
    description: `TRIGGER: User says 'what screens not tested / find coverage gaps / missing scenarios'\nRETURNS: { report: string, prompt: string, gaps: Array<{screen, missingScenarios[]}> }\nNEXT: Use prompt for generate_cucumber_pom to create missing tests\nCOST: Medium (parses all .feature files, ~200-400 tokens)\nERROR_HANDLING: None - always succeeds, may return empty gaps if full coverage.\n\nParses .feature files to identify untested screens and missing edge cases.\n\nOUTPUT: Ack (≤10 words), proceed.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "projectRoot": z.string(),
        "featureFilesPaths": z.array(z.string())
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async (args) => {
    const { projectRoot, featureFilesPaths } = args;
    const report = coverageAnalysisService.analyzeCoverage(projectRoot, featureFilesPaths);
    const prompt = coverageAnalysisService.getCoveragePrompt(report);
    return textResult(JSON.stringify({ report, prompt, gaps: report.coverageGaps }, null, 2));
});
server.registerTool("export_bug_report", {
    description: `TRIGGER: Failed test needs tracking in ticket OR create Jira bug report\nRETURNS: Markdown string (Jira-ready format with severity, steps, environment, fix suggestion)\nNEXT: Copy Markdown to Jira → Create ticket\nCOST: Low (formats error into template, ~100-200 tokens)\nERROR_HANDLING: None - always succeeds, may request clarification for severity.\n\nAuto-classifies severity, adds reproduction steps, environment details, suggested fix.\n\nOUTPUT: Ack (≤10 words), proceed.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        "testName": z.string(),
        "rawError": z.string(),
        "browser": z.string().optional(),
        "baseUrl": z.string().optional(),
        "appVersion": z.string().optional()
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async (args) => {
    const { testName, rawError, browser, baseUrl, appVersion } = args;
    return textResult(bugReportService.generateBugReport(testName, rawError, browser, baseUrl, appVersion));
});
// TASK-64: export_navigation_map
server.registerTool("export_navigation_map", {
    description: `VISUALIZE APP NAVIGATION. Performs static analysis of feature files and page objects to build a URL navigation graph. Returns a Mermaid diagram and known screen list. For richer maps, run discover_app_flow first.\n\nRETURNS: { diagram: mermaid string, knownScreens: string[], source: static|live|seed }\nNEXT: Save diagram to .TestForge/nav-graph.md (done automatically). Use with generate_gherkin_pom_test_suite for context.\nOUTPUT: Ack (≤10 words), proceed.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        projectRoot: z.string().describe("Absolute path to the automation project."),
        forceRebuild: z.boolean().optional().describe("If true, re-analyzes files ignoring cache.")
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async (args) => {
    const { projectRoot, forceRebuild } = args;
    const navSvc = getNavService(projectRoot);
    await navSvc.buildFromStaticAnalysis(forceRebuild ?? false);
    const diagram = navSvc.exportMermaidDiagram();
    const screens = navSvc.getKnownScreens();
    const source = navSvc.getMapSource();
    const sourceNote = source === 'seed'
        ? '🌱 Seed map: no existing navigation data found. Run discover_app_flow to build a real map.'
        : source === 'static'
            ? '📊 Static analysis: built from feature files and page objects.'
            : '🔴 Live + Static: enriched with live Playwright crawl.';
    const output = `## Navigation Map\n\n${sourceNote}\nKnown pages: ${screens.length}\n\n${diagram}\n\nPages:\n${screens.map(s => `  - ${s}`).join('\n')}`;
    return textResult(truncate(output));
});
// TASK-45: discover_app_flow — live Playwright crawl
server.registerTool("discover_app_flow", {
    description: `TRIGGER: User says 'map the app / discover nav / crawl the site / what screens exist'\nWHAT IT DOES: Launches a headless Playwright browser, spiders links from startUrl (same-origin only), records page transitions into a persistent navigation graph (.TestForge/navigation-map.json) and exports a Mermaid diagram.\nRETURNS: { pagesDiscovered: number, diagram: mermaid, knownPaths: string }\nNEXT: export_navigation_map to view diagram, or generate_gherkin_pom_test_suite (diagram auto-injected into prompt via TASK-34).\nCOST: Medium (launches browser, crawls up to 25 pages).\nOUTPUT: Ack (≤10 words), proceed.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
    inputSchema: z.object({
        projectRoot: z.string().describe("Absolute path to the automation project."),
        startUrl: z.string().describe("The URL to start crawling from (e.g. http://localhost:3000)."),
        storageState: z.string().optional().describe("Optional Playwright storageState JSON path for pre-authenticated crawls."),
        maxPages: z.number().optional().describe("Max pages to crawl (default: 25).")
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
}, async (args) => {
    const { projectRoot, startUrl, storageState, maxPages } = args;
    const navSvc = getNavService(projectRoot);
    const graph = await navSvc.discoverAppFlow(startUrl, storageState, maxPages ?? 25);
    const diagram = navSvc.exportMermaidDiagram();
    const screens = navSvc.getKnownScreens();
    const knownPaths = navSvc.getKnownPathsText();
    const result = JSON.stringify({
        pagesDiscovered: Object.keys(graph.nodes).length,
        source: graph.source,
        knownScreens: screens,
        knownPaths,
        diagram
    }, null, 2);
    return textResult(truncate(result));
});
// CLI setup for Stdio vs SSE
const program = new Command();
program
    .name("TestForge")
    .description("MCP server for Playwright-BDD POM generation");
program
    .command("setup")
    .description("Bootstrap a new Playwright-BDD project")
    .argument("<projectRoot>", "Absolute path to the project root")
    .action(async (projectRoot) => {
    const setup = new ProjectSetupService();
    const result = await setup.setup(path.resolve(projectRoot));
    console.log(result);
    process.exit(0);
});
program
    .command("upgrade")
    .description("Upgrade an existing project to latest MCP features")
    .argument("<projectRoot>", "Absolute path to the project root")
    .action(async (projectRoot) => {
    const root = path.resolve(projectRoot);
    const maint = new ProjectMaintenanceService();
    const result = await maint.upgradeProject(root);
    console.log(result);
    process.exit(0);
});
program
    .command("serve", { isDefault: true })
    .description("Start the MCP server (Stdio or SSE)")
    .option("--port <number>", "Port to run SSE server on")
    .option("--host <string>", "Host to run SSE server on", "127.0.0.1")
    .action(async (options) => {
    await startServer(options);
});
program.parse(process.argv);
async function startServer(options) {
    if (options.port) {
        // SSE Transport
        const app = express();
        let transport;
        app.get("/sse", async (req, res) => {
            transport = new SSEServerTransport("/message", res);
            await server.connect(transport);
        });
        app.post("/message", async (req, res) => {
            if (transport) {
                await transport.handlePostMessage(req, res);
            }
            else {
                res.status(400).send("Transport not established");
            }
        });
        const port = parseInt(options.port, 10);
        const host = options.host || "127.0.0.1";
        app.listen(port, host, () => {
            console.log(`[TestForge] Remote SSE listening on http://${host}:${port}/sse`);
        });
    }
    else {
        // Stdio Transport
        const transport = new StdioServerTransport();
        await server.connect(transport);
        // Silent startup log, as stdio is in use
    }
}
// startServer is now called via the "serve" command's action handler
//# sourceMappingURL=index.js.map