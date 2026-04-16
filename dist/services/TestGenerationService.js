import * as fs from 'fs/promises';
import * as path from 'path';
import { HybridPromptEngine } from './HybridPromptEngine.js';
import { ExtensionLoader } from '../utils/ExtensionLoader.js';
// TASK-34: Max Gherkin screens kept in context for prompt compression
const MAX_GHERKIN_SCREENS = 3;
export class TestGenerationService {
    async generatePromptInstruction(testDescription, projectRoot, analysisResult, customWrapperPackage, baseUrl, memoryPrompt = "") {
        memoryPrompt += ExtensionLoader.loadExtensionsForPrompt(projectRoot);
        // --- Phase 23: Extract team preferences from mcp-config.json if present ---
        const cfg = analysisResult.mcpConfig;
        const allowedTags = cfg?.allowedTags ?? ['@smoke', '@regression', '@e2e'];
        const bgThreshold = cfg?.backgroundBlockThreshold ?? 3;
        const waitStrategy = cfg?.waitStrategy ?? 'networkidle';
        const authStrategy = cfg?.authStrategy ?? 'users-json';
        const archNotesPath = cfg?.architectureNotesPath ?? 'docs/mcp-architecture-notes.md';
        // Item 11: Read Architecture Notes if exists
        let archNotes = '';
        try {
            const fullPath = path.resolve(projectRoot, archNotesPath);
            archNotes = await fs.readFile(fullPath, 'utf8');
        }
        catch (e) {
            // It is perfectly normal if architecture notes do not exist
        }
        // Item 3: Build env context from analysis result if present
        let envContext = '';
        if (analysisResult.envConfig?.present) {
            envContext = `\n--- Environment Configuration (Item 3: REUSE THESE) ---\n` +
                `Existing Files: ${analysisResult.envConfig.files.join(', ')}\n` +
                `Detected Keys: ${analysisResult.envConfig.keys.join(', ') || 'N/A'}`;
        }
        // Build user context when users-json auth is configured
        const userRoles = analysisResult.userRoles;
        const userContext = (authStrategy === 'users-json' && userRoles && userRoles.roles.length > 0)
            ? `\n--- Multi-User Credential Store (users-json strategy, env: ${userRoles.environment}) ---\n` +
                `Available roles: ${userRoles.roles.join(', ')}\n` +
                `Helper import: ${userRoles.helperImport}\n` +
                `Usage in Page Object methods: const { username, password } = getUser('<role>');\n` +
                `NEVER use process.env.USERNAME or process.env.PASSWORD — always use getUser() instead.`
            : '';
        // --- Token efficiency: relevance filter to reduce context bloat on mature projects ---
        // Extract keywords from the test description to filter only related steps and page objects.
        // Falls back to including everything if description is too short to filter meaningfully.
        const descWords = testDescription
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 3); // skip short words like "the", "and", "with"
        const isDescriptive = descWords.length >= 3;
        function isRelevant(text) {
            if (!isDescriptive)
                return true; // can't filter without enough context — include all
            const lower = text.toLowerCase();
            return descWords.some((w) => lower.includes(w));
        }
        const MAX_STEPS = 60;
        const MAX_PAGE_OBJECTS = 10;
        // ---------------------------------------------------------------------------------
        const reusedContext = [
            analysisResult.bddSetup.present ? "Existing playwright-bdd configuration" : "No playwright-bdd found (needs provisioning)",
            "--- Naming Conventions (MUST FOLLOW) ---",
            `Features: ${analysisResult.namingConventions.features}`,
            `Page Objects: ${analysisResult.namingConventions.pages}`,
            "--- Existing Step Patterns to Reuse ---",
            ...(analysisResult.existingStepDefinitions
                .flatMap(s => s.steps.map(step => `- ${step}`))
                .filter(step => isRelevant(step))
                .slice(0, MAX_STEPS)),
            "--- Page Objects ---",
            ...(analysisResult.existingPageObjects
                .filter(p => isRelevant(p.path) || isRelevant(p.publicMethods.join(' ')))
                .slice(0, MAX_PAGE_OBJECTS)
                .map(p => `${p.path} -> Methods: ${p.publicMethods.join(', ')}`)),
            ...(analysisResult.customWrapper ? [
                `Custom Wrapper (${analysisResult.customWrapper.package}): ${analysisResult.customWrapper.isInstalled ? analysisResult.customWrapper.detectedMethods.join(', ') : 'Not Installed/Resolved'}`,
            ] : []),
            ...(analysisResult.importAliases && Object.keys(analysisResult.importAliases).length > 0 ? [
                "\n--- TypeScript Import Aliases (tsconfig.json paths) ---",
                `Do NOT use deep relative paths (e.g. '../../pages/MyPage.ts') if an alias exists. You MUST map imports to these aliases:`,
                JSON.stringify(analysisResult.importAliases, null, 2)
            ] : []),
            archNotes ? `\n--- ARCHITECTURE NOTES (Item 11: FOLLOW THESE) ---\n${archNotes}` : ''
        ];
        const envStrategyRule = analysisResult.envConfig?.present
            ? "Assume the project uses a `.env` file (e.g., `process.env.BASE_URL`). Use Playwright's `baseURL` config or `dotenv` rather than hardcoding."
            : "Assume the project manages configuration dynamically (e.g., via a `config/` directory, custom module, or Playwright projects). Infer the config import from context and use IT rather than hardcoding.";
        const dotenvImportRule = analysisResult.envConfig?.present
            ? "14. Environment Variables: Every generated Page Object file MUST start with `import 'dotenv/config';` as the very first line, so `process.env.*` values from `.env` are available at runtime."
            : "14. Environment Variables: Do NOT inject `import 'dotenv/config';`. Use the project's native configuration strategy as inferred from existing Page Objects or Utility helpers.";
        // Detect if BasePage exists in the project
        const hasBasePage = analysisResult.existingPageObjects.some(p => p.className === 'BasePage' || p.path?.includes('BasePage'));
        const basePageRule = hasBasePage
            ? `6. **Page Class Extension**: A \`BasePage\` class IS detected in this project. ALL new Page Objects MUST extend \`BasePage\` by importing from the correct relative path. Inherit and reuse its \`navigate()\`, \`waitForStable()\`, \`checkAccessibility()\` methods.`
            : `6. **Page Class Extension**: No \`BasePage\` is detected in this project. Do NOT attempt to extend or import \`BasePage\`. Export a plain class with a \`constructor(protected page: Page) {}\` signature and self-contained Playwright API calls.`;
        let instructContent = `[SYSTEM INSTRUCTION: MCP TEST GENERATION]
You are a highly capable QA automation engineer.
Your task is to generate a Playwright-BDD + POM test suite for the following description:
"${testDescription}"

--- CONTEXT ---
Target Project Root: ${projectRoot}
Base URL (optional): ${baseUrl || 'none'}
Playwright-BDD Present: ${analysisResult.bddSetup.present}
BasePage Detected: ${hasBasePage}
${envContext}
${userContext}

Existing Page Objects and Methods available for reuse:
${reusedContext.join('\n')}

--- EXISTING TEST DATA STRUCTURES (Rule 26: REUSE THESE) ---
${analysisResult.existingTestData ? [...analysisResult.existingTestData.payloads, ...analysisResult.existingTestData.fixtures].map(d => `${d.path}: ${d.sampledStructure}`).join('\n') : 'None discovered.'}

--- MANDATORY REQUIREMENTS (SOLID & BDD PATTERNS) ---
1. You MUST output a structured JSON response EXACTLY matching the formatting requested below. Do NOT wrap the JSON in markdown code blocks, or if you do, ensure the JSON is perfectly valid.
2. Step definitions MUST NEVER contain raw Playwright calls (e.g., page.locator). They must strictly call Page Object Model methods.
3. Reuse existing POM methods from the context above whenever possible. Avoid duplicating existing logic.
4. Semantic Step Matching & Fuzzy Adaptation: If your intent is semantically similar to an "Existing Step Pattern" listed above (e.g. "I press login" vs "I click login button"), you MUST REWRITE your requested step in the \`.feature\` file to exactly match the existing step definition. Do NOT create a duplicate step definition.
5. Environments & URLs: Do NOT hardcode sensitive URLs or credentials in your steps. ${envStrategyRule}
${basePageRule}
7. Asynchronous Auto-Waiting: Unless handled by a Custom Wrapper, Page Object methods MUST use Playwright's web-first assertions (e.g. \`await expect(this.btn).toBeVisible()\`) to prevent race conditions during page transitions.
8. Data-Driven Testing: Default to generating Gherkin \`Scenario Outline:\` with an \`Examples:\` data table when dealing with user inputs, rather than hardcoding static data inside the steps.
9. Strict Assertions: Every \`Then\` step MUST contain at least one valid assertion (via wrapper or Playwright \`expect\`) verifying a visible DOM state. URL assertions alone are insufficient.
10. Page Transitions & Navigation: If a method triggers a page transition, it MUST end by explicitly waiting for the new page to stabilize (e.g., \`await this.page.waitForLoadState('domcontentloaded')\` or asserting a unique element on the *following* page).
11. Complex Interactions (Mouse/Keyboard): For actions like drag-and-drop or hover, use Playwright's native APIs (e.g., \`await this.page.dragAndDrop()\`) UNLESS the Custom Wrapper provides an abstraction for it. NEVER use raw \`page.evaluate()\` unless natively unsupported.
12. Background Steps: If ${bgThreshold} or more Scenarios in a feature share the same first \`Given\` step (e.g., navigation to a URL or login), extract it into a Gherkin \`Background:\` block. Never repeat the same step in every scenario when a Background can be used.
13. Test Tags: Every \`Scenario\` or \`Scenario Outline\` MUST be tagged with at least one of: ${allowedTags.map(t => `\`${t}\``).join(', ')}. Use this logic:
    - Login, homepage, critical navigation = first tag in the list
    - Form submission, data entry, CRUD = second tag in the list
    - Full end-to-end user journeys = last tag in the list
    Tags must appear on the line directly above \`Scenario:\` or \`Scenario Outline:\`.
${dotenvImportRule}
15. Page Load Waits: After any navigation, use \`await this.page.waitForLoadState('${waitStrategy}')\` as the standard wait strategy for this project.
16. Multi-Tab Interactions: If an action opens a new browser tab, you MUST use \`const [newPage] = await Promise.all([this.page.context().waitForEvent('page'), <action>])\`. Pass this \`newPage\` to subsequent Page Objects instead of the original page. To return to the main window, use \`await this.page.bringToFront()\` and resume using the original page object.
17. API Interception & Capturing: For mocking APIs, use \`await this.page.route('**/endpoint', ...)\` BEFORE the action. For capturing API responses, use \`const [response] = await Promise.all([this.page.waitForResponse('**/api/*'), actionThatTriggersIt()]);\` to prevent race conditions. Share captured data across steps using module-level variables.
18. Mid-Test HTTP & Auth: For pure API calls, extract the \`request\` fixture (\`async ({ page, request }) => {...}\`).
    - **Payloads**: NEVER hardcode massive JSON bodies in Gherkin text. If the user step says \`using payload "fixtures/file.json"\`, you MUST extract the body using \`JSON.parse(fs.readFileSync(path, 'utf8'))\` dynamically inside the step definition.
    - **Authentication**: NEVER hardcode API tokens or secrets in Gherkin. If the step mentions "Bearer token", "Basic auth", etc., construct the \`Authorization\` header dynamically in the step definition using \`process.env\` variables (e.g., \`Authorization: Bearer \${process.env.API_TOKEN}\`).
19. TypeScript DTOs & Models: If handling complex API JSON payloads/responses, or if the user requests strong typing, NEVER use implicit \`any\`. You MUST generate a TypeScript \`export interface ...\` file representing the data shape and save it in the \`models/\` directory.
20. Step-Level Context & Fixtures: You MUST use the native Playwright-BDD destructuring (\`async ({ page, myPage }) => { ... }\`) within EVERY step definition. NEVER store the \`page\` object in a module-level variable or class constructor that persists across steps.
21. Spec File Guard: You are EXPLICITLY FORBIDDEN from generating or modifying any \`.spec.ts\` files (e.g., those in \`.features-gen/\`). These files are managed by the \`npx bddgen\` command.
22. Advanced Page Stability: Before taking any screenshot or performing an action after a tab switch/navigation, you MUST inject logic to verify the page is fully loaded.
23. Ad & Popup Interception: If the test description implies a public-facing site with intrusive ads/popups, include a shared utility method to identify and close common overlays before proceeding.
24. Intelligent Feature Merging: If you are asked to create a scenario that logically belongs to an existing feature file, you MUST return the content of the existing file with the NEW scenario appended to the end, rather than creating a duplicate file. Do NOT delete existing scenarios.
25. POM Enforcement for Wrappers: Even if a Custom Wrapper provides high-level actions, you MUST still generate a project-specific Page Object class and encapsulate the UI logic in specific methods. Step definitions MUST NEVER instantiate and call the wrapper class directly.
26. Test Data Reuse: You MUST prioritize reusing the existing test data structures provided in context.
27. Automated Accessibility: If the user description mentions "accessibility", "WCAG", "a11y", or "compliance", include a \`Then I check accessibility of the page\` step that maps to \`await pageObject.checkAccessibility()\`.
28. TSConfig Autowiring: If your implementation creates a NEW top-level architectural directory (e.g., \`models/\`, \`types/\`, \`helpers/\`), you MUST update \`tsconfig.json\` to add the corresponding path alias.
29. **[PHASE 4: STATE-MACHINE MICRO-PROMPTING]**: If this request requires generating a very large Page Object AND complex step definitions simultaneously, serialize your work. Generate and invoke \`validate_and_write\` for ONLY the \`jsonPageObjects\` first. Wait for compilation success before generating the \`.feature\` and \`.steps.ts\` files.

${memoryPrompt}

--- PLAYWRIGHT-BDD SPECIFIC RULES ---
- Step definitions MUST be defined using \`playwright-bdd\`, not standard Cucumber:
  \`\`\`typescript
  import { createBdd } from 'playwright-bdd';
  const { Given, When, Then } = createBdd();
  \`\`\`
- CRITICAL: \`createBdd()\` takes NO arguments. NEVER write \`createBdd(test)\` — this is a common mistake that causes a runtime error.
- Standard Playwright APIs (expect, Page, Locator, etc.) MUST be imported from \`@playwright/test\`. Fixtures (\`page\`, custom fixtures) are injected via step destructuring: \`async ({ page, myPage }) => {}\`.
- NEVER import \`test\` or \`expect\` from \`playwright-bdd\` — they belong to \`@playwright/test\`, which is installed implicitly by \`playwright-bdd\`.
- Do NOT import from \`@cucumber/cucumber\`.
- In your explanation string, remind the user that they must run \`npm test\` to generate the test files and execute them.

--- OUTPUT SCHEMA ---
Your entire response must be a single JSON object with this shape. DO NOT write raw TypeScript strings for Page Objects. You MUST output Page Objects exclusively in the \`jsonPageObjects\` array to avoid syntactical/formatting hallucinations. The MCP server will generate the TypeScript files for you.
{
  "files": [
    {
      "path": "features/new-feature.feature",
      "content": "Feature: ...\\n"
    },
    {
      "path": "step-definitions/new-steps.ts",
      "content": "import { createBdd } from 'playwright-bdd';...\\n"
    }
  ],
  "jsonPageObjects": [
    {
      "className": "NewPage",
      "path": "pages/NewPage.ts",
      "extendsClass": ${hasBasePage ? '"BasePage"' : 'null'},
      "imports": [${hasBasePage ? '"import { BasePage } from \'./BasePage\';"' : '"import { Page } from \'@playwright/test\';"'}],
      "locators": [
         { "name": "submitBtn", "selector": "#submit" }
      ],
      "methods": [
         { "name": "submit", "args": [], "body": ["await this.submitBtn.click();"] }
      ]
    }
  ],
  "setupRequired": ${!analysisResult.bddSetup.present},
  "reusedComponents": [
    // List string descriptions of what you decided to reuse
  ],
  "explanation": "Brief explanation of the generated structure."
}
`;
        // TASK-34: Compress existing Gherkin context
        const gherkinCtx = await this.compressFeatureFiles(projectRoot, analysisResult);
        if (gherkinCtx) {
            instructContent += `\n\n--- EXISTING FEATURE CONTEXT (last ${MAX_GHERKIN_SCREENS} screens, compressed) ---\n${gherkinCtx}`;
        }
        // TASK-34: Inject Mermaid nav graph if available
        const navGraph = await this.injectNavGraph(projectRoot);
        if (navGraph) {
            instructContent += `\n\n--- NAVIGATION GRAPH (Mermaid — use to understand screen flow) ---\n${navGraph}`;
        }
        // TF-NEW-05: Inject 3-layer Hybrid Prompt block (CoT + Champion + Anti-Patterns)
        const hybridEngine = new HybridPromptEngine();
        const hybridBlock = hybridEngine.buildHybridBlock(analysisResult);
        instructContent += `\n\n${hybridBlock}`;
        return instructContent;
    }
    /**
     * TASK-34 — Gherkin Prompt Compression.
     * Reads all .feature files in the project, extracts Scenario/Scenario Outline
     * headings per file, and returns only the last MAX_GHERKIN_SCREENS unique
     * screen contexts in a compact text block.
     *
     * Rationale: Large projects accumulate hundreds of Gherkin lines. The LLM only
     * needs the most recent screen context to avoid step duplication — earlier
     * screens are already encoded in the existingStepDefinitions analysis slice.
     */
    async compressFeatureFiles(projectRoot, analysis) {
        try {
            const featuresRoot = analysis.detectedPaths?.featuresRoot;
            if (!featuresRoot)
                return '';
            const absRoot = path.resolve(projectRoot, featuresRoot);
            const entries = await fs.readdir(absRoot, { recursive: true }).catch(() => []);
            const featureFiles = entries.filter(f => f.endsWith('.feature')).sort();
            if (featureFiles.length === 0)
                return '';
            // Collect screen summaries per file (Feature name + Scenario titles)
            const screens = [];
            for (const file of featureFiles) {
                const absPath = path.join(absRoot, file);
                const content = await fs.readFile(absPath, 'utf8').catch(() => '');
                if (!content)
                    continue;
                const lines = content.split('\n');
                const featureLine = lines.find(l => l.trim().startsWith('Feature:'))?.trim() ?? `Feature: ${file}`;
                const scenarios = lines
                    .filter(l => l.trim().startsWith('Scenario:') || l.trim().startsWith('Scenario Outline:'))
                    .map(l => `  - ${l.trim()}`);
                screens.push(`${featureLine}\n${scenarios.join('\n') || '  (no scenarios)'}`);
            }
            if (screens.length === 0)
                return '';
            // Keep only the last N screens for context
            const kept = screens.slice(-MAX_GHERKIN_SCREENS);
            const dropped = screens.length - kept.length;
            const header = dropped > 0
                ? `[Compressed: showing ${kept.length} of ${screens.length} feature files — ${dropped} earlier file(s) omitted]`
                : `[${kept.length} feature file(s)]`;
            return `${header}\n\n${kept.join('\n\n')}`;
        }
        catch {
            return '';
        }
    }
    /**
     * TASK-34 — Mermaid Navigation Graph Injection.
     * Looks for a pre-built Mermaid diagram at .TestForge/nav-graph.md (generated
     * by export_navigation_map or similar tooling). If found, includes it verbatim
     * so the LLM understands screen-to-screen transitions before generating steps.
     *
     * Fallback: also accepts graphify-out/nav-graph.md for compatibility with
     * projects using graphify to build their navigation maps.
     */
    async injectNavGraph(projectRoot) {
        const candidates = [
            path.join(projectRoot, '.TestForge', 'nav-graph.md'),
            path.join(projectRoot, 'graphify-out', 'nav-graph.md'),
            path.join(projectRoot, 'docs', 'nav-graph.md'),
        ];
        for (const candidate of candidates) {
            try {
                const content = await fs.readFile(candidate, 'utf8');
                if (!content.trim())
                    continue;
                // Cap to 3000 chars to stay within token budget
                const capped = content.length > 3000 ? content.slice(0, 3000) + '\n... [graph truncated to stay within token budget]' : content;
                return capped;
            }
            catch {
                // next candidate
            }
        }
        return '';
    }
}
//# sourceMappingURL=TestGenerationService.js.map