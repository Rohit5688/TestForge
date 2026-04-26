import * as fs from 'fs/promises';
import * as path from 'path';
import type { ITestGenerator, GeneratedFile, TestGenerationResult } from '../../interfaces/ITestGenerator.js';
import type { CodebaseAnalysisResult } from '../../interfaces/ICodebaseAnalyzer.js';
import { HybridPromptEngine } from './HybridPromptEngine.js';
import { ExtensionLoader } from '../../utils/ExtensionLoader.js';

// TASK-34: Max Gherkin screens kept in context for prompt compression
const MAX_GHERKIN_SCREENS = 3;

export class TestGenerationService implements ITestGenerator {

  public async generatePromptInstruction(
    testDescription: string,
    projectRoot: string,
    analysisResult: CodebaseAnalysisResult,
    customWrapperPackage?: string,
    baseUrl?: string,
    memoryPrompt: string = "",
    domJsonContext?: string,   // Optional: JSON string of JsonElement[] from inspect_page_dom(returnFormat:'json')
    testContext?: import('../../types/TestContext.js').TestContext, // Pre-gathered verified DOM + network context
  ): Promise<string> {

    memoryPrompt += ExtensionLoader.loadExtensionsForPrompt(projectRoot);

    // --- Phase 23: Extract team preferences from mcp-config.json if present ---
    const cfg = analysisResult.mcpConfig;
    const allowedTags: string[] = cfg?.allowedTags ?? ['@smoke', '@regression', '@e2e'];
    const bgThreshold: number = cfg?.backgroundBlockThreshold ?? 3;
    const waitStrategy: string = cfg?.waitStrategy ?? 'domcontentloaded';
    const authStrategy: string = cfg?.authStrategy ?? 'users-json';
    const archNotesPath: string = (cfg as any)?.architectureNotesPath ?? 'docs/mcp-architecture-notes.md';

    // Item 11: Read Architecture Notes if exists
    let archNotes = '';
    try {
      const fullPath = path.resolve(projectRoot, archNotesPath);
      archNotes = await fs.readFile(fullPath, 'utf8');
    } catch (e) {
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
    const userContext = (authStrategy === 'users-json' && userRoles && (userRoles.roles?.length ?? 0) > 0)
      ? `\n--- Multi-User Credential Store (users-json strategy, env: ${userRoles.environment}) ---\n` +
      `Available roles: ${userRoles.roles?.join(', ') || 'N/A'}\n` +
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

    function isRelevant(text: string): boolean {
      if (!isDescriptive) return true; // can't filter without enough context — include all
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
    const hasBasePage = analysisResult.existingPageObjects.some(
      p => p.className === 'BasePage' || p.path?.includes('BasePage')
    );

    const basePageRule = hasBasePage
      ? `6. **Page Class Extension (MANDATORY)**: \`BasePage\` IS detected. ALL Page Objects MUST extend it (\`class LoginPage extends BasePage\`). 

   ⚡ **TOKEN-EFFICIENT ACTION PATTERN** (use these instead of \`this.page.*\` directly):
   - \`await this.click(this.submitBtn)\`      ← NOT \`await this.submitBtn.click()\`
   - \`await this.fill(this.emailInput, val)\`  ← NOT \`await this.emailInput.fill(val)\`
   - \`await this.hover(this.menuItem)\`        ← NOT \`await this.menuItem.hover()\`
   - \`await this.selectOption(this.dropdown, label)\` ← NOT \`await this.dropdown.selectOption()\`
   - \`await this.goto(url)\`                  ← NOT \`await this.page.goto(url)\`
   - \`await this.waitForResponse('/api/x')\`  ← NOT \`await this.page.waitForResponse(...)\`
   - \`await this.expectVisible(this.header)\` ← NOT \`await expect(this.header).toBeVisible()\`
   - \`await this.waitForStable()\`            ← NOT \`await this.page.waitForLoadState(...)\`

   Direct \`this.page.*\` calls are ONLY allowed for: \`this.page.getByRole()\`, \`this.page.getByTestId()\`, \`this.page.context()\`, \`this.page.route()\`, \`this.page.waitForResponse()\` (inside \`Promise.all\`), multi-tab handling.`
      : `6. **Page Class Extension**: No \`BasePage\` detected. Export a plain class with \`constructor(protected readonly page: Page) {}\`. All Playwright calls go through \`this.page.*\` directly.`;

    const customWrapperPkg = analysisResult.customWrapper?.package || 'vasu-playwright-utils';
    const detectedUtils = analysisResult.customWrapper?.detectedMethods && analysisResult.customWrapper.detectedMethods.length > 0 
      ? analysisResult.customWrapper.detectedMethods.map(m => m.replace('()', '')).join(', ')
      : 'getPage, getRequest, executeStep';

    const customWrapperRule = analysisResult.customWrapper?.isInstalled
      ? `\n    - ⚡ **UTILITY AWARENESS (CRITICAL)**: The library \`${customWrapperPkg}\` provides these utilities: [ ${detectedUtils} ].\n      You MUST import and use these functions (e.g., \`import { utilityName } from '${customWrapperPkg}';\`) instead of writing custom TypeScript or native Playwright logic for these actions.`
      : '';

    // ── DOM JSON CONTEXT BLOCK ──────────────────────────────────────────────
    // When inspect_page_dom was called with returnFormat:'json', the caller may
    // pass the structured element list here. This gives the LLM explicit field
    // references instead of requiring it to parse prose Markdown.
    let locatorSourceSection = '';
    if (domJsonContext) {
      let elements: Array<{ id: number; role: string; text?: string; locator: string; selectorArgs?: Record<string, string> }> = [];
      try { elements = JSON.parse(domJsonContext); } catch { /* malformed — ignore */ }
      if (elements.length > 0) {
        locatorSourceSection = `
--- DOM ELEMENT REFERENCE (from inspect_page_dom) ---
The following ${elements.length} actionable element(s) were captured from the live page.
Each entry has an \`id\`, \`role\`, optional \`text\`, and a \`locator\` that is a
ready-to-use Playwright API string. Copy \`locator\` EXACTLY into your Page Object.
Do NOT paraphrase, css-ify, or re-derive these selectors.

${JSON.stringify(elements, null, 2)}

RULES for using the above:
  • Copy \`element.locator\` verbatim as a private property:  private btnX = ${elements[0]?.locator ?? 'page.getByRole(...)'}
  • Do NOT wrap in page.locator() — these are already fully-formed API calls.
  • If selectorArgs are present and a custom wrapper is in use, call the wrapper method instead (see CUSTOM WRAPPER SELECTOR RULES below if present).
--- END DOM ELEMENT REFERENCE ---
`;
      }
    }
    // ── END DOM JSON CONTEXT BLOCK ──────────────────────────────────────────

    // --- VERIFIED DOM CONTEXT (from gather_test_context) ---
    if (testContext && testContext.version === '1' && Array.isArray(testContext.pages) && testContext.pages.length > 0) {
      const pageBlocks = testContext.pages.map(p => {
        const elemLines = (Array.isArray(p.elements) ? p.elements : []).map(e => {
          const typeHint = e.inputType ? ` (${e.inputType})` : '';
          return `  - ${e.role} "${e.name}": ${e.locator}${typeHint}`;
        }).join('\n');
        
        const netLines = Array.isArray(p.networkOnLoad) && p.networkOnLoad.length > 0
          ? p.networkOnLoad.map(n => `  - ${n.method} ${n.urlPath} → ${n.status}`).join('\n')
          : '  (none)';
          
        return `Page: ${p.title} (${p.resolvedUrl})\nActionable elements:\n${elemLines}\nNetwork calls on load:\n${netLines}`;
      }).join('\n\n');

      memoryPrompt += `\n\n## ✅ VERIFIED DOM DATA (gathered ${testContext.gatheredAt})\n` +
        `You MUST use these exact Playwright locators — do not guess or invent selectors.\n` +
        `For network calls, use waitForResponse(r => r.url().includes('PATH') && r.status() === STATUS) \n` +
        `before the action that triggers it. Do NOT use waitForLoadState('networkidle') — use 'domcontentloaded' or wait for structural elements instead.\n\n` +
        pageBlocks;
    } else if (!testContext && !domJsonContext) {
      memoryPrompt += `\n\n## ⚠️ DOM CONTEXT MISSING — MANDATORY PRE-FLIGHT REQUIRED\n` +
        `You do NOT have verified DOM data. BEFORE calling validate_and_write, call gather_test_context with:\n` +
        `  baseUrl: "${baseUrl ?? '<the app base URL>'}"\n` +
        `  paths: [<relative paths this test visits, e.g. "/login", "/dashboard">]\n` +
        `Pass the returned JSON as testContext to generate_gherkin_pom_test_suite before generating code.`;
    }

    const stepContextRule = analysisResult.mcpConfig?.setPageRequired === true
      ? `20. Step-Level Context — Native Fixture Pattern (setPageRequired=true): This project DOES NOT use autoSetup. The \`page\` fixture is NOT pre-wired. You MUST initialize it manually.
    - ⚠️ **[CRITICAL — READ THIS FIRST]**: This project uses the Native Fixture Pattern. The global singleton is NOT initialized automatically. You MUST call \`setPage(page)\` yourself.
    - Page Objects instantiate with NO args: \`const homePage = new HomePage();\` — NEVER \`new HomePage(page)\`.
    - Inside Page Objects, the page is accessed via \`this.page\` (which calls \`getPage()\` from the BasePage getter).
    - ⚡ **MANDATORY**: The VERY FIRST Given step of each scenario MUST destructure \`{ page }\` and call \`setPage(page);\` BEFORE any Page Object method is called.
    - All OTHER steps must use \`async ({}) => {}\` (empty object destructuring) to map arguments correctly.${customWrapperRule}`
      : `20. Step-Level Context & Singleton Pattern: This project uses \`${customWrapperPkg}\` with a singleton page store. You MUST follow the singleton pattern EVERYWHERE:
    - ⚡ **[CRITICAL BDD FIXTURE MANDATE]**: Step definitions MUST use \`async ({}) => {}\` (empty object destructuring) if no fixtures are used. NO fixture destructuring like \`async ({ page }) ...\` is allowed. NEVER write \`async () => {}\`.
    - Page Objects instantiate with NO args: \`const homePage = new HomePage();\` — NEVER \`new HomePage(page)\`.
    - Inside Page Objects, the page is accessed via \`this.page\` (which calls \`getPage()\` from the BasePage getter).
    - For API calls from steps: \`import { getRequest } from '${customWrapperPkg}'; const req = getRequest();\`
    - \`getPage()\`/\`getRequest()\` are pre-wired before each scenario by \`test-setup/page-setup.ts\` — always available.${customWrapperRule}`;

    const bddSpecificRules = analysisResult.mcpConfig?.setPageRequired === true
      ? `--- PLAYWRIGHT-BDD SPECIFIC RULES ---
- Step definitions MUST be defined using \`playwright-bdd\`:
  \`\`\`typescript
  import { createBdd } from 'playwright-bdd';
  const { Given, When, Then } = createBdd();
  import { setPage } from '${customWrapperPkg}';
  \`\`\`
- CRITICAL: You MUST explicitly call \`setPage(page)\` in the first step of your scenario to initialize the singleton.
  \`\`\`typescript
  // ✅ CORRECT — First step initializes singleton
  Given('I navigate to home', async ({ page }) => {
    setPage(page);
    await homePage.navigate('/');
  });
  // ✅ CORRECT — Subsequent steps use empty destructuring
  When('I click login', async ({}) => {
    await homePage.clickLogin();
  });
  \`\`\`
- Standard Playwright APIs (expect, Locator, etc.) MUST be imported from \`@playwright/test\`.
- Do NOT import from \`@cucumber/cucumber\`.
- In your explanation string, remind the user to run \`npm test\` to generate and execute the tests.`
      : `--- PLAYWRIGHT-BDD SPECIFIC RULES ---
- Step definitions MUST be defined using \`playwright-bdd\` + the project's extended \`test\` object:
  \`\`\`typescript
  import { createBdd } from 'playwright-bdd';
  import { test } from '../test-setup/page-setup.js';
  const { Given, When, Then } = createBdd(test);
  \`\`\`
- CRITICAL: \`createBdd(test)\` takes the exported \`test\` from \`test-setup/page-setup.ts\` as its argument.
  This is what connects the \`autoSetup\` fixture (which calls \`setPage(page)\`) to every step.
  NEVER write \`createBdd()\` with no argument — steps will lack the singleton wiring.
- Standard Playwright APIs (expect, Locator, etc.) MUST be imported from \`@playwright/test\`.
- NEVER destructure \`{ page }\` in a step body — the singleton is already set by the fixture.
  \`\`\`typescript
  // ✅ CORRECT — Page Objects declared ONCE at top of file, reused across steps
  const homePage = new HomePage();
  Given('I navigate to home', async ({}) => {
    await homePage.navigate('/');
  });
  // ❌ WRONG — per-step instantiation wastes memory and breaks singleton expectations
  Given('I navigate to home (WRONG)', async ({}) => {
    const home = new HomePage(); // never do this inside a step
    await home.navigate('/');
  });
  // ❌ WRONG — do not inject page via fixture destructuring
  Given('I navigate to home', async ({ page }) => {
    await page.goto('/');
  });
  \`\`\`
- NEVER import \`test\` or \`expect\` from \`playwright-bdd\` — \`expect\` belongs to \`@playwright/test\`.
- Do NOT import from \`@cucumber/cucumber\`.
- In your explanation string, remind the user to run \`npm test\` to generate and execute the tests.`;

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
⚡⚡ **[PRE-RULE MANDATE — READ BEFORE ALL RULES BELOW]**
Every step definition signature MUST follow this exact pattern or the BDD runner will crash:
- ✅ Steps with NO fixtures:  \`async ({}) => {}\`  — empty object destructuring is REQUIRED
- ✅ First step when setPageRequired=true: \`async ({ page }) => { setPage(page); ... }\`
- ❌ NEVER write \`async () => {}\` — playwright-bdd cannot map arguments without the destructure
- ❌ NEVER write \`async ({ page }) => {}\` in normal steps — page is managed by the singleton
This mandate overrides your instinct to write clean arrow functions. The \`{}\` is non-optional.
──────────────────────────────────────────────────────────────────────────
1. You MUST output a structured JSON response EXACTLY matching the formatting requested below. Do NOT wrap the JSON in markdown code blocks, or if you do, ensure the JSON is perfectly valid.
2. Step definitions MUST NEVER contain raw Playwright calls (e.g., page.locator). They must strictly call Page Object Model methods. Page Object locators MUST use \`vasu-playwright-utils\` functions: \`getLocatorByTestId()\`, \`getLocatorByRole()\`, \`getLocatorByLabel()\`, \`getLocatorByText()\`, \`getLocatorByPlaceholder()\`. NEVER use native Playwright locator calls (e.g., \`this.page.locator\`) or XPath/CSS class selectors directly.
3. Reuse existing POM methods from the context above whenever possible. Avoid duplicating existing logic.
4. Semantic Step Matching & Fuzzy Adaptation: If your intent is semantically similar to an "Existing Step Pattern" listed above (e.g. "I press login" vs "I click login button"), you MUST REWRITE your requested step in the \`.feature\` file to exactly match the existing step definition. Do NOT create a duplicate step definition.
5. Environments & URLs: Do NOT hardcode sensitive URLs or credentials in your steps. ${envStrategyRule}
${basePageRule}
7. Asynchronous Auto-Waiting: Unless handled by a Custom Wrapper, Page Object methods MUST use \`vasu-playwright-utils\` assertions (e.g. \`await expectElementToBeVisible(this.btn)\`) to prevent race conditions during page transitions.
8. Data-Driven Testing: Default to generating Gherkin \`Scenario Outline:\` with an \`Examples:\` data table when dealing with user inputs, rather than hardcoding static data inside the steps.
9. Strict Assertions: Every \`Then\` step MUST contain at least one valid assertion (via wrapper or Playwright \`expect\`) verifying a visible DOM state. URL assertions alone are insufficient.
10. Page Transitions & Navigation: If a method triggers a page transition, it MUST end by calling \`await this.waitForStable()\` (BasePage helper) OR asserting a unique element on the following page. Do NOT call \`this.page.waitForLoadState()\` directly in Page Objects that extend BasePage.
11. Complex Interactions (Mouse/Keyboard): For actions like drag-and-drop or hover, use Playwright's native APIs (e.g., \`await this.page.dragAndDrop()\`) UNLESS the Custom Wrapper provides an abstraction for it.
    🚫 **FORCE HAMMER BAN (Critical):** NEVER use \`force: true\` on any click or interaction that represents a primary user action. NEVER use \`.evaluate(el => el.click())\` or \`.evaluate(el => el.dispatchEvent(...))\` as a workaround for a blocked element. These bypass Playwright's actionability checks and mask real synchronization bugs or genuine UI defects that a real user would encounter. If an element is obscured by an overlay, the ONLY correct fix is: \`await expect(overlay).toBeHidden()\` BEFORE the click. Playwright automatically scrolls elements into view before clicking — manual \`scrollIntoViewIfNeeded()\` as a pre-click ritual is also a smell of incorrect interaction timing.
12. Background Steps: If ${bgThreshold} or more Scenarios in a feature share the same first \`Given\` step (e.g., navigation to a URL or login), extract it into a Gherkin \`Background:\` block. Never repeat the same step in every scenario when a Background can be used.
13. Test Tags: Every \`Scenario\` or \`Scenario Outline\` MUST be tagged with at least one of: ${allowedTags.map(t => `\`${t}\``).join(', ')}. Use this logic:
    - Login, homepage, critical navigation = first tag in the list
    - Form submission, data entry, CRUD = second tag in the list
    - Full end-to-end user journeys = last tag in the list
    Tags must appear on the line directly above \`Scenario:\` or \`Scenario Outline:\`.
${dotenvImportRule}
15. Page Load Waits & State Transitions: After any navigation, call \`await this.waitForStable()\` (if extending BasePage) or \`await this.page.waitForLoadState('${waitStrategy}')\`. NEVER use \`waitForLoadState('networkidle')\` — modern SPAs maintain persistent connections and it will time out or produce flaky results. Use \`'domcontentloaded'\` for faster, more reliable hydration signaling.
    🚫 **WEB-FIRST ASSERTION MANDATE:** Do NOT rely on \`page.title()\`, \`getURL()\`, or \`waitForLoadState('networkidle')\` to verify that a new screen has loaded after an action. You MUST assert a unique structural element on the target page: \`await expectElementToBeVisible(getLocator('.product-grid-item').first())\`. This is the only reliable signal that the page has hydrated in a SPA. URL/title checks are acceptable for supplementary assertions ONLY — they are FORBIDDEN as primary state-transition guards.
16. Multi-Tab Interactions: If an action opens a new browser tab, you MUST use \`const [newPage] = await Promise.all([this.page.context().waitForEvent('page'), <action>])\`. Pass this \`newPage\` to subsequent Page Objects instead of the original page. To return to the main window, use \`await this.page.bringToFront()\` and resume using the original page object.
17. API Interception & Capturing: For mocking APIs, use \`await this.page.route('**/endpoint', ...)\` BEFORE the action. For capturing API responses, use \`const [response] = await Promise.all([this.page.waitForResponse('**/api/*'), actionThatTriggersIt()]);\` to prevent race conditions. Share captured data across steps using module-level variables.
18. Mid-Test HTTP & Auth: For pure API calls, extract the \`request\` fixture (\`async ({ page, request }) => {...}\`).
    - **Payloads**: NEVER hardcode massive JSON bodies in Gherkin text. If the user step says \`using payload "fixtures/file.json"\`, you MUST extract the body using \`JSON.parse(fs.readFileSync(path, 'utf8'))\` dynamically inside the step definition.
    - **Authentication**: NEVER hardcode API tokens or secrets in Gherkin. If the step mentions "Bearer token", "Basic auth", etc., construct the \`Authorization\` header dynamically in the step definition using \`process.env\` variables (e.g., \`Authorization: Bearer \${process.env.API_TOKEN}\`).
19. TypeScript DTOs & Models: If handling complex API JSON payloads/responses, or if the user requests strong typing, NEVER use implicit \`any\`. You MUST generate a TypeScript \`export interface ...\` file representing the data shape and save it in the \`models/\` directory.
${stepContextRule}
21. Spec File Guard: You are EXPLICITLY FORBIDDEN from generating or modifying any \`.spec.ts\` files (e.g., those in \`.features-gen/\`). These files are managed by the \`npx bddgen\` command.
22. Advanced Page Stability: Before taking any screenshot or performing an action after a tab switch/navigation, you MUST inject logic to verify the page is fully loaded.
23. Ad & Popup Interception: If the test description implies a public-facing site with intrusive ads/popups, include a shared utility method to identify and close common overlays before proceeding.
24. Intelligent Feature Merging: If you are asked to create a scenario that logically belongs to an existing feature file, you MUST return the content of the existing file with the NEW scenario appended to the end, rather than creating a duplicate file. Do NOT delete existing scenarios.
25. POM Enforcement for Wrappers: Even if a Custom Wrapper provides high-level actions, you MUST still generate a project-specific Page Object class and encapsulate the UI logic in specific methods. Step definitions MUST NEVER instantiate and call the wrapper class directly.
26. Test Data Reuse: You MUST prioritize reusing the existing test data structures provided in context.
27. Automated Accessibility: If the user description mentions "accessibility", "WCAG", "a11y", or "compliance", include a \`Then I check accessibility of the page\` step that maps to \`await pageObject.checkAccessibility()\`.
28. TSConfig Autowiring: If your implementation creates a NEW top-level architectural directory (e.g., \`models/\`, \`types/\`, \`helpers/\`), you MUST update \`tsconfig.json\` to add the corresponding path alias.
29. **[PHASE 4: STATE-MACHINE MICRO-PROMPTING]**: If this request requires generating a very large Page Object AND complex step definitions simultaneously, serialize your work. Generate and invoke \`validate_and_write\` for ONLY the \`jsonPageObjects\` first. Wait for compilation success before generating the \`.feature\` and \`.steps.ts\` files.
31. **[COMPLETION TOKEN BUDGET — STRICT]**: Every token in your response is billable.
    - ❌ NEVER add inline comments to generated code: \`// Wait for element\`, \`// Click button\`, \`// Navigate to page\`
    - ❌ NEVER add JSDoc blocks to generated methods
    - ❌ NEVER explain what a line does in a comment — the method name is the documentation
    - ✅ Use \`jsonSteps\` instead of writing raw TypeScript in \`files[]\` for step definitions (saves ~70% output tokens)
    - ✅ Use \`jsonPageObjects\` for ALL Page Objects (already required by Rule 30)
    - ✅ The \`explanation\` field is the ONLY place for natural language — keep it to 1-2 sentences
32. **[E2E JOURNEY INTEGRITY — Critical]:** NEVER use \`gotoURL()\` as a fallback inside a test step when a UI interaction fails. If a drawer, modal, or button is blocked or fails to open, the ONLY correct response is to wait for the blocking overlay to clear (\`await expectElementToBeHidden(overlay)\`) and retry the interaction. Using \`gotoURL('/cart')\` to skip a failed UI element creates a **False Positive** — the test passes but the feature is broken for real users. Direct URL navigation via \`gotoURL()\` is permitted ONLY for the initial application entry point in a \`Given\` step.
33. **[STRICT-MODE RESOLUTION — Critical]:** When Playwright throws a strict-mode violation ("resolved to N elements"), NEVER suppress it with \`.first()\`. Using \`.first()\` silently targets an unseen element (e.g., a hidden mobile navbar) and breaks on viewport changes. The ONLY correct resolution strategies are:
    - **Container scoping:** \`getLocator('nav').getByRole('searchbox')\` — scope to the visible parent container.
    - **Visibility filter:** Use \`getVisibleLocator()\` from \`vasu-playwright-utils\` — explicitly require visibility.
    - **Named locator:** Add a \`{ name: '...' }\` option to \`getLocatorByRole\` to disambiguate semantically (e.g., \`getLocatorByRole('button', { name: 'Add to Cart' })\`).
34. **[TYPESCRIPT COMPILATION SAFETY — Critical]:** You MUST write syntactically valid TypeScript. The MCP server runs \`tsc --noEmit\` on your generated \`jsonPageObjects\`. To prevent compilation failures:
    - ALWAYS declare class properties inside your \`jsonPageObjects.locators\` array before using them in \`methods\`.
    - NEVER call \`this.someLocator\` inside \`methods\` if you did NOT define \`someLocator\` in \`locators\`.
    - Ensure all imported types/interfaces exist and use \`any\` as a last resort ONLY if the type is unknown.
    - If your generated \`validate_and_write\` fails with a TypeScript error, you MUST read the error and try again, fixing the undefined variable or syntax error.


${memoryPrompt}

${locatorSourceSection}

${bddSpecificRules}

30. **[CRITICAL: ONE CLASS PER FILE — NEVER MONOLITHIC]**: You MUST generate a SEPARATE \`jsonPageObjects\` entry for EACH distinct page or screen in the test flow. NEVER combine multiple pages into a single Page Object class or a single file.
    - ❌ WRONG: One \`EcommercePage\` class with methods for Home, Product, Cart, Checkout
    - ✅ CORRECT: \`HomePage\`, \`ProductPage\`, \`CartPage\`, \`CheckoutPage\` — each a separate entry in \`jsonPageObjects\` with its own \`path\`
    - Rule of thumb: if the URL changes during the flow, a new Page Object is required.
    - **Step File Split (MUST):** Generate ONE \`jsonSteps\` entry per feature file — NEVER dump all step definitions into a single \`.steps.ts\` file. A flow covering Login + Cart + Checkout MUST produce three entries: \`step-definitions/login.steps.ts\`, \`step-definitions/cart.steps.ts\`, \`step-definitions/checkout.steps.ts\`. Page Object instances shared within the same step file are declared once at the top (outside any step body).

--- OUTPUT SCHEMA ---
Your entire response must be a single JSON object. DO NOT write raw TypeScript for Page Objects or step definitions.
- Page Objects → ALWAYS use \`jsonPageObjects\` (server generates TypeScript, no hallucination risk)
- Step Definitions → PREFER \`jsonSteps\` for all standard steps (server generates boilerplate, ~70% fewer completion tokens)
  Use \`files[]\` for step definitions ONLY when a step has complex multi-page logic that cannot fit jsonSteps shape.
- Feature files → ALWAYS use \`files[]\` (Gherkin has no boilerplate to strip)
- Zero inline comments in any generated code (Rule 31)

IMPORTANT: If the test flow visits N distinct pages/screens, the \`jsonPageObjects\` array MUST have N entries — one per page. See the multi-page example below:
{
  "files": [
    {
      "path": "features/checkout.feature",
      "content": "Feature: ...\\n"
    },
  ],
  "jsonPageObjects": [
    {
      "className": "HomePage",
      "path": "pages/HomePage.ts",
      "extendsClass": ${hasBasePage ? '"BasePage"' : 'null'},
      "imports": [${hasBasePage ? '"import { BasePage } from \'./BasePage\';"' : '"import { Page } from \'@playwright/test\';"'}],
      "locators": [
         { "name": "searchInput", "selector": "page.getByRole('searchbox', { name: 'Search' })" }
      ],
      "methods": [
         { "name": "search", "args": ["term: string"], "body": ["await this.fill(this.searchInput, term);", "await this.searchInput.press('Enter');"] }
      ]
    },
    {
      "className": "ProductPage",
      "path": "pages/ProductPage.ts",
      "extendsClass": ${hasBasePage ? '"BasePage"' : 'null'},
      "imports": [${hasBasePage ? '"import { BasePage } from \'./BasePage\';"' : '"import { Page } from \'@playwright/test\';"'}],
      "locators": [
         { "name": "addToCartBtn", "selector": "page.getByRole('button', { name: 'Add to Cart' })" }
      ],
      "methods": [
         { "name": "addToCart", "args": [], "body": ["await this.click(this.addToCartBtn);"] }
      ]
    },
    {
      "className": "CartPage",
      "path": "pages/CartPage.ts",
      "extendsClass": ${hasBasePage ? '"BasePage"' : 'null'},
      "imports": [${hasBasePage ? '"import { BasePage } from \'./BasePage\';"' : '"import { Page } from \'@playwright/test\';"'}],
      "locators": [
         { "name": "checkoutBtn", "selector": "page.getByRole('button', { name: 'Checkout' })" }
      ],
      "methods": [
         { "name": "proceedToCheckout", "args": [], "body": ["await this.click(this.checkoutBtn);", "await this.waitForStable();"] }
      ]
    }
  ],
  "setupRequired": ${!analysisResult.bddSetup.present},
  "jsonSteps": [
    {
      "path": "step-definitions/checkout.steps.ts",
      "pageImports": ["HomePage", "ProductPage", "CartPage"],
      "steps": [
        { "type": "Given", "pattern": "I am on the home page", "page": "HomePage", "method": "navigate", "args": ["process.env['BASE_URL'] ?? ''"] },
        { "type": "When",  "pattern": "I search for {string}", "params": ["term: string"], "page": "HomePage", "method": "search", "args": ["term"] },
        { "type": "When",  "pattern": "I add the product to the cart", "page": "ProductPage", "method": "addToCart", "args": [] },
        { "type": "Then",  "pattern": "I should see the order summary",
          "body": ["await expect(page.getByRole('heading', { name: 'Order Summary' })).toBeVisible();"] }
      ]
    }
  ],
  "reusedComponents": [],
  "explanation": "1-2 sentence summary only."
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
  private async compressFeatureFiles(projectRoot: string, analysis: CodebaseAnalysisResult): Promise<string> {
    try {
      const featuresRoot = analysis.detectedPaths?.featuresRoot;
      if (!featuresRoot) return '';

      const absRoot = path.resolve(projectRoot, featuresRoot);
      const entries = await fs.readdir(absRoot, { recursive: true }).catch(() => [] as string[]);
      const featureFiles = (entries as string[]).filter(f => f.endsWith('.feature')).sort();

      if (featureFiles.length === 0) return '';

      // Collect screen summaries per file (Feature name + Scenario titles)
      const screens: string[] = [];
      for (const file of featureFiles) {
        const absPath = path.join(absRoot, file);
        const content = await fs.readFile(absPath, 'utf8').catch(() => '');
        if (!content) continue;

        const lines = content.split('\n');
        const featureLine = lines.find(l => l.trim().startsWith('Feature:'))?.trim() ?? `Feature: ${file}`;
        const scenarios = lines
          .filter(l => l.trim().startsWith('Scenario:') || l.trim().startsWith('Scenario Outline:'))
          .map(l => `  - ${l.trim()}`);

        screens.push(`${featureLine}\n${scenarios.join('\n') || '  (no scenarios)'}`);
      }

      if (screens.length === 0) return '';

      // Keep only the last N screens for context
      const kept = screens.slice(-MAX_GHERKIN_SCREENS);
      const dropped = screens.length - kept.length;
      const header = dropped > 0
        ? `[Compressed: showing ${kept.length} of ${screens.length} feature files — ${dropped} earlier file(s) omitted]`
        : `[${kept.length} feature file(s)]`;

      return `${header}\n\n${kept.join('\n\n')}`;
    } catch {
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
  private async injectNavGraph(projectRoot: string): Promise<string> {
    const candidates = [
      path.join(projectRoot, '.TestForge', 'nav-graph.md'),
      path.join(projectRoot, 'graphify-out', 'nav-graph.md'),
      path.join(projectRoot, 'docs', 'nav-graph.md'),
    ];

    for (const candidate of candidates) {
      try {
        const content = await fs.readFile(candidate, 'utf8');
        if (!content.trim()) continue;
        // Cap to 3000 chars to stay within token budget
        const capped = content.length > 3000 ? content.slice(0, 3000) + '\n... [graph truncated to stay within token budget]' : content;
        return capped;
      } catch {
        // next candidate
      }
    }

    return '';
  }
}
