import * as fs from 'fs';
import * as path from 'path';

export class ProjectScaffolder {
  /**
   * Ensures the standard TestForge directory structure exists.
   */
  public scaffoldDirectories(projectRoot: string): string[] {
    const dirsCreated: string[] = [];
    const dirs = ['features', 'pages', 'step-definitions', 'fixtures', 'models', 'test-data', 'test-setup', '.claude/skills', '.claude/agents', '.cursor/rules', '.github/agents', '.github/skills'];

    for (const dir of dirs) {
      const fullPath = path.join(projectRoot, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        dirsCreated.push(dir);
      }
    }
    return dirsCreated;
  }

  private writeIfMissing(projectRoot: string, relativePath: string, content: string): boolean {
    const fullPath = path.join(projectRoot, relativePath);
    if (fs.existsSync(fullPath)) return false;
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, 'utf-8');
    return true;
  }

  /**
   * Scaffolds package.json if it doesn't exist.
   */
  public scaffoldPackageJson(projectRoot: string): boolean {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) return false;

    const packageJson = {
      name: path.basename(projectRoot),
      version: '1.0.0',
      type: 'module',
      scripts: {
        'postinstall': 'npx vasu-pw-setup --force',
        'test': 'bddgen && playwright test',
        'test:smoke': 'bddgen && playwright test --grep @smoke',
        'test:regression': 'bddgen && playwright test --grep @regression',
        'test:e2e': 'bddgen && playwright test --grep @e2e',
        'test:headed': 'bddgen && playwright test --headed',
        'test:report': 'playwright show-report',
        'test:gen': 'npx bddgen',
        'lint': 'tsc --noEmit',
      },
      devDependencies: {
        'playwright-bdd': '^8.5.0',
        'vasu-playwright-utils': '^1.25.0',
        'typescript': '^5.0.0',
        'ts-node': '^10.9.2',
        '@types/node': '^20.0.0',
        'dotenv': '^16.4.5',
        '@axe-core/playwright': '^4.9.0',
        '@faker-js/faker': '^8.4.1',
      }
    };
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
    return true;
  }

  /**
   * Scaffolds playwright.config.ts if it doesn't exist.
   */
  public scaffoldPlaywrightConfig(projectRoot: string): boolean {
    const configPath = path.join(projectRoot, 'playwright.config.ts');
    if (fs.existsSync(configPath)) return false;

    const configContent = [
      "import 'dotenv/config';",
      "import { defineConfig, devices } from '@playwright/test';",
      "import { defineBddConfig } from 'playwright-bdd';",
      "const testDir = defineBddConfig({",
      "  featuresRoot: 'features',",
      "  features: '**/*.feature',",
      "  steps: 'step-definitions/**/*.ts',",
      "  importTestFrom: './test-setup/page-setup.ts',",
      "});",
      "",
      "export default defineConfig({",
      "  testDir,",
      "  timeout: 30_000,",
      "  retries: 1,",
      "  reporter: [['html', { open: 'never' }], ['list']],",
      "  use: {",
      "    baseURL: process.env['BASE_URL'] ?? 'http://localhost:3000',",
      "    headless: process.env['HEADLESS'] !== 'false',",
      "    screenshot: 'only-on-failure',",
      "    video: 'retain-on-failure',",
      "    trace: 'retain-on-failure',",
      "  },",
      "  projects: [",
      "    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },",
      "  ],",
      "});",
    ].join('\n');
    fs.writeFileSync(configPath, configContent, 'utf-8');
    return true;
  }

  /**
   * Scaffolds tsconfig.json if it doesn't exist.
   */
  public scaffoldTsConfig(projectRoot: string): boolean {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) return false;

    const tsconfig = {
      compilerOptions: {
        module: 'ESNext',
        target: 'ES2022',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
      },
      include: ['**/*.ts'],
      exclude: ['node_modules', 'dist', '.features-gen'],
    };
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf-8');
    return true;
  }

  /**
   * Scaffolds BasePage.ts if it doesn't exist.
   */
  public scaffoldBasePage(projectRoot: string): boolean {
    const basePagePath = path.join(projectRoot, 'pages', 'BasePage.ts');
    if (fs.existsSync(basePagePath)) return false;

    const basePageContent = [
      "import { Locator, expect } from '@playwright/test';",
      "import { getPage, getLocator, click, fill, hover, expectElementToBeVisible, selectByText, waitForPageLoadState } from 'vasu-playwright-utils';",
      "import 'dotenv/config';",
      "",
      "export class BasePage {",
      "  protected get page() { return getPage(); }",
      "",
      "  protected async goto(url: string): Promise<void> {",
      "    await this.page.goto(url, { waitUntil: 'domcontentloaded' });",
      "  }",
      "",
      "  protected async waitForResponse(urlFragment: string, status = 200): Promise<void> {",
      "    await this.page.waitForResponse(",
      "      resp => resp.url().includes(urlFragment) && resp.status() === status",
      "    );",
      "  }",
      "",
      "  protected async click(locator: Locator): Promise<void> {",
      "    await click(locator);",
      "  }",
      "",
      "  protected async fill(locator: Locator, value: string): Promise<void> {",
      "    await fill(locator, value);",
      "  }",
      "",
      "  protected async selectOption(locator: Locator, label: string): Promise<void> {",
      "    await selectByText(locator, label);",
      "  }",
      "",
      "  protected async hover(locator: Locator): Promise<void> {",
      "    await hover(locator);",
      "  }",
      "",
      "  protected async expectVisible(locator: Locator): Promise<void> {",
      "    await expectElementToBeVisible(locator);",
      "  }",
      "",
      "  protected async expectText(locator: Locator, text: string): Promise<void> {",
      "    await expect(locator).toContainText(text);",
      "  }",
      "",
      "  async waitForStable(visibilityCheck?: Locator): Promise<void> {",
      "    await waitForPageLoadState({ waitUntil: 'domcontentloaded' });",
      "    if (visibilityCheck) await expectElementToBeVisible(visibilityCheck);",
      "  }",
      "",
      "  async closePopups(): Promise<void> {",
      "    const candidates = [",
      "      this.page.getByRole('button', { name: 'Close' }),",
      "      getLocator('button.close').first(),",
      "      getLocator('.modal-close').first(),",
      "    ];",
      "    for (const btn of candidates) {",
      "      if (await btn.isVisible()) { await click(btn); break; }",
      "    }",
      "  }",
      "",
      "  async navigate(url: string): Promise<void> {",
      "    await this.goto(url);",
      "    await this.waitForStable();",
      "    await this.closePopups();",
      "  }",
      "",
      "  async checkAccessibility(scanName = 'Page Scan'): Promise<void> {",
      "    const { AxeBuilder } = await import('@axe-core/playwright');",
      "    const results = await new AxeBuilder({ page: this.page })",
      "      .withTags(['wcag2aa', 'wcag21aa', 'wcag2a'])",
      "      .analyze();",
      "    if (results.violations.length > 0) {",
      "      console.error(`[A11Y] ${scanName}:`, results.violations.map(v => v.description));",
      "    }",
      "    expect(results.violations).toEqual([]);",
      "  }",
      "}",
    ].join('\n');
    fs.writeFileSync(basePagePath, basePageContent, 'utf-8');
    return true;
  }

  /**
   * Scaffolds page-setup.ts if it doesn't exist.
   */
  public scaffoldPageSetup(projectRoot: string): boolean {
    const pageSetupPath = path.join(projectRoot, 'test-setup', 'page-setup.ts');
    if (fs.existsSync(pageSetupPath)) return false;

    const pageSetupContent = [
      "import { test as base } from 'playwright-bdd';",
      "import { setPage } from 'vasu-playwright-utils';",
      "",
      "export const test = base.extend<{ autoSetup: void }>({",
      "  autoSetup: [",
      "    async ({ page }, use) => {",
      "      setPage(page);",
      "      await use();",
      "    },",
      "    { auto: true },",
      "  ],",
      "});",
    ].join('\n');
    fs.writeFileSync(pageSetupPath, pageSetupContent, 'utf-8');
    return true;
  }

  /**
   * Scaffolds .gitignore if it doesn't exist.
   */
  public scaffoldGitIgnore(projectRoot: string): boolean {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) return false;

    const content = [
      'node_modules/',
      'dist/',
      '.features-gen/',
      'test-results/',
      'playwright-report/',
      '*.env',
      '.env.*',
      '!.env.example',
      'test-data/users.*.json',
    ].join('\n');
    fs.writeFileSync(gitignorePath, content, 'utf-8');
    return true;
  }

  /**
   * Scaffolds sample.feature if it doesn't exist.
   */
  public scaffoldSampleFeature(projectRoot: string): boolean {
    const sampleFeaturePath = path.join(projectRoot, 'features', 'sample.feature');
    if (fs.existsSync(sampleFeaturePath)) return false;

    const featureContent = [
      '@smoke @setup',
      'Feature: TestForge setup smoke test',
      '',
      '  Scenario: Verify the generated scaffold can run',
      '    Given I open the TestForge setup smoke page',
      '    Then the TestForge setup title should be visible',
    ].join('\n');
    fs.writeFileSync(sampleFeaturePath, featureContent, 'utf-8');
    return true;
  }

  /**
   * Scaffolds step definitions for sample.feature if they don't exist.
   */
  public scaffoldSampleSteps(projectRoot: string): boolean {
    const sampleStepsPath = path.join(projectRoot, 'step-definitions', 'sample.steps.ts');
    if (fs.existsSync(sampleStepsPath)) return false;

    const stepsContent = [
      "import { expect } from '@playwright/test';",
      "import { createBdd } from 'playwright-bdd';",
      "import { test } from '../test-setup/page-setup.js';",
      "",
      "const { Given, Then } = createBdd(test);",
      "",
      "const SETUP_SMOKE_HTML = [",
      "  '<!doctype html>',",
      "  '<html lang=\"en\">',",
      "  '<head><title>TestForge Setup Ready</title></head>',",
      "  '<body><main><h1>TestForge Setup Ready</h1></main></body>',",
      "  '</html>',",
      "].join('');",
      "",
      "Given('I open the TestForge setup smoke page', async ({ page }) => {",
      "  await page.goto(`data:text/html,${encodeURIComponent(SETUP_SMOKE_HTML)}`);",
      "});",
      "",
      "Then('the TestForge setup title should be visible', async ({ page }) => {",
      "  await expect(page).toHaveTitle('TestForge Setup Ready');",
      "  await expect(page.getByRole('heading', { name: 'TestForge Setup Ready' })).toBeVisible();",
      "});",
    ].join('\n');
    fs.writeFileSync(sampleStepsPath, stepsContent, 'utf-8');
    return true;
  }

  /**
   * Scaffolds project-local AI agent and skills so LLM clients can use TestForge
   * correctly even when the TestForge source repository is not open.
   */
  public scaffoldAgentSkills(projectRoot: string): string[] {
    const filesCreated: string[] = [];
    const files: Array<{ path: string; content: string }> = [
      {
        path: '.github/agents/testforge-agent.agent.md',
        content: [
          '---',
          'name: testforge-agent',
          'description: Use TestForge MCP to create, validate, run, and heal Playwright-BDD tests in this repository.',
          'argument-hint: "Create a BDD test for login, inspect the DOM, run @smoke, or heal the latest failure"',
          'tools: ["mcp", "read", "write", "search", "execute"]',
          '---',
          '',
          '# TestForge Agent',
          '',
          'Use this agent when working with the TestForge MCP in this repository. Assume the user has TestForge configured as an MCP server, but the TestForge source code is not available in this workspace.',
          '',
          'This is not a generic Playwright-BDD agent. It is an operating guide for TestForge MCP tools and their expected sequencing.',
          '',
          '## Core Workflow',
          '1. Read `.github/skills/testforge-setup-and-preflight.md` before setup or first run.',
          '2. Read `.github/skills/testforge-playwright-bdd.md` before creating or editing feature and step files.',
          '3. Read `.github/skills/testforge-web-selectors.md` before locator work or selector healing.',
          '4. Read `.github/skills/testforge-api-testing.md` before API, auth, or network interception tests.',
          '5. Read `.github/skills/testforge-dom-and-locators.md` before generating UI tests or healing selectors.',
          '6. Read `.github/skills/testforge-new-bdd-test.md` before creating feature, page, or step files.',
          '7. Read `.github/skills/testforge-run-and-heal.md` before running or fixing tests.',
          '8. Read `.github/skills/testforge-verification-and-truth.md` before claiming success.',
          '',
          '## Guard Rails',
          '- Prefer TestForge MCP tools over hand-editing generated test files.',
          '- Never expose secrets returned from env or user stores; treat values as sensitive.',
          '- Use `validate_and_write(dryRun:true)` for preview only; rerun without dryRun to write.',
          '- Reuse existing steps and page objects before creating new ones.',
          '- Run the smallest relevant verification before broader suites.',
          '- Do not report success from zero-test output.',
          '',
          '## Common Tool Order',
          'setup_project -> check_playwright_ready -> inspect_page_dom -> generate_gherkin_pom_test_suite -> validate_and_write -> run_playwright_test -> self_heal_test',
          '',
          '## TestForge MCP Tool Groups',
          '- Setup/readiness: `setup_project`, `repair_project`, `upgrade_project`, `check_playwright_ready`, `check_environment`.',
          '- Context: `inspect_page_dom`, `gather_test_context`, `list_existing_steps`, `get_project_contract`.',
          '- Generation/write: `generate_gherkin_pom_test_suite`, `validate_and_write`, `create_test_atomically`.',
          '- Execution/healing: `run_playwright_test`, `get_test_run_status`, `self_heal_test`, `verify_selector`.',
          '- Config/data: `manage_env`, `manage_users`, `manage_config`.',
        ].join('\n')
      },
      {
        path: '.github/skills/testforge-setup-and-preflight.md',
        content: [
          '---',
          'name: testforge-setup-and-preflight',
          'description: Use TestForge setup and readiness tools before creating or running tests in a target project.',
          'applyTo: "**"',
          '---',
          '',
          '# TestForge Setup and Preflight',
          '',
          'This skill is specific to TestForge MCP setup behavior. Do not replace these steps with generic npm or Playwright setup advice unless a TestForge tool reports an exact manual repair command.',
          '',
          '## When To Use',
          '- First time configuring TestForge in this repository.',
          '- After dependency, browser, env, or config changes.',
          '- Before a first test run in a fresh checkout.',
          '',
          '## Workflow',
          '1. Call `setup_project({ projectRoot })`.',
          '2. If setup returns `CONFIG_TEMPLATE_CREATED`, update `mcp-config.json`, then call `setup_project` again.',
          '3. If setup returns `SETUP_BLOCKED`, read `installDetails.steps[]` and run/fix the failed command before continuing.',
          '4. Call `check_playwright_ready({ projectRoot })` before generation or execution.',
          '5. Use `manage_env` and `manage_users` to create required env/user files. Never echo secret values in responses.',
          '',
          '## Expected Scaffold',
          '- `features/`, `step-definitions/`, `pages/`, `fixtures/`, `models/`, `test-data/`, `test-setup/`.',
          '- `features/sample.feature` plus `step-definitions/sample.steps.ts` for a setup smoke test.',
          '- `.github/agents/testforge-agent.agent.md` and `.github/skills/testforge-*.md` for LLM guidance.',
          '',
          '## Blockers',
          '- Missing `node_modules` after setup is a blocker.',
          '- Missing Playwright browser executable is a blocker.',
          '- `0 passed, 0 failed` is not a useful readiness signal.',
          '',
          '## TestForge Tool Contracts',
          '- `setup_project` may run in two phases: template creation first, full scaffold second.',
          '- `SETUP_BLOCKED` is not success; inspect `installDetails.steps[]`.',
          '- `upgrade_project` must verify browser launch before claiming browsers are installed.',
          '- `manage_env` and `manage_users` responses are redacted by design.',
        ].join('\n')
      },
      {
        path: '.github/skills/testforge-new-bdd-test.md',
        content: [
          '---',
          'name: testforge-new-bdd-test',
          'description: Create new Playwright-BDD tests through TestForge MCP with feature files, page objects, and step definitions.',
          'applyTo: "**"',
          '---',
          '',
          '# TestForge New BDD Test',
          '',
          'This skill is specific to generating tests through TestForge MCP. Do not hand-roll files first; use TestForge generation and validation tools as the primary workflow.',
          '',
          '## Inputs To Gather',
          '- Target app URL or page path.',
          '- User role and required test data.',
          '- Scenario intent, assertions, and tags.',
          '- Existing feature/step/page conventions in this repo.',
          '',
          '## Workflow',
          '1. Call `list_existing_steps({ projectRoot })` and reuse matching step language where possible.',
          '2. Call `inspect_page_dom({ projectRoot, url, returnFormat:"json" })` or `gather_test_context` for the target pages.',
          '3. Call `generate_gherkin_pom_test_suite` with DOM/context and desired scenarios.',
          '4. Call `validate_and_write({ projectRoot, dryRun:true, files })` to preview.',
          '5. If preview passes and the user wants the files, call `validate_and_write` without `dryRun`.',
          '6. Run the smallest relevant test with `run_playwright_test`, using `tags` or `specificTestArgs`.',
          '',
          '## TestForge MCP Tools Used',
          '- `list_existing_steps`: discover current step vocabulary before generation.',
          '- `inspect_page_dom` / `gather_test_context`: collect live page context for generation.',
          '- `generate_gherkin_pom_test_suite`: generate TestForge-compatible feature/POM/step content.',
          '- `validate_and_write`: stage, validate, and write generated files; `dryRun:true` is preview only.',
          '- `run_playwright_test`: verify the smallest relevant tag or feature.',
          '',
          '## Code Rules',
          '- Keep Gherkin business-readable and reusable.',
          '- Prefer stable locators: test id, role/name, label, meaningful text, then CSS.',
          '- Avoid XPath and brittle DOM chains.',
          '- Do not duplicate step definitions if an existing semantic match exists.',
          '- Keep page actions in page objects; steps should orchestrate behavior.',
        ].join('\n')
      },
      {
        path: '.github/skills/testforge-playwright-bdd.md',
        content: [
          '---',
          'name: testforge-playwright-bdd',
          'description: Maintain TestForge Playwright-BDD feature files and step definitions using TestForge MCP conventions.',
          'applyTo: "**/*.{feature,ts,js}"',
          '---',
          '',
          '# TestForge Playwright-BDD',
          '',
          'This skill adapts Playwright-BDD practice to TestForge MCP projects. It is intentionally TestForge-specific and assumes `setup_project` created `test-setup/page-setup.ts` and the standard folders.',
          '',
          '## Discover Existing Test Language',
          '- Prefer `list_existing_steps({ projectRoot })` before writing new Gherkin.',
          '- If using shell fallback, run `npx bddgen export` with the project config and reuse matching patterns exactly.',
          '- Read existing `.feature` files for tag, Background, Scenario Outline, data table, and doc string conventions.',
          '',
          '## Required Step Pattern',
          '- Import `createBdd` from `playwright-bdd`.',
          '- Import `test` from `../test-setup/page-setup.js`.',
          '- Declare `const { Given, When, Then } = createBdd(test);`.',
          '- In normal UI steps, instantiate page objects without passing `page`: `const loginPage = new LoginPage();`.',
          '- Keep raw Playwright calls out of steps; steps should call page object methods.',
          '',
          '```typescript',
          "import { createBdd } from 'playwright-bdd';",
          "import { test } from '../test-setup/page-setup.js';",
          '',
          'const { Given, When, Then } = createBdd(test);',
          '',
          "Given('I sign in as an admin', async () => {",
          '  const loginPage = new LoginPage();',
          "  await loginPage.signInAs('admin');",
          '});',
          '```',
          '',
          '## API and Network Exceptions',
          '- For pure API work inside TestForge steps, prefer `getRequest()` from `vasu-playwright-utils`.',
          '- For network interception tied to a browser action, fixture destructuring is allowed only when the step explicitly needs Playwright `page` or `request`.',
          '- Keep API payload interfaces in `models/` when payloads are complex.',
          '',
          '## Tags and Targeted Runs',
          '- Match existing tag conventions such as `@smoke`, `@regression`, or product-specific tags.',
          '- Prefer `run_playwright_test({ projectRoot, tags:"@tag" })` to verify tagged work.',
          '- TestForge sends tag filters to both `bddgen --tags` and Playwright `--grep`.',
          '- For one feature, use `run_playwright_test` with `specificTestArgs` rather than running the whole suite.',
          '',
          '## Gherkin Rules',
          '- Keep scenarios business-readable and avoid implementation details.',
          '- Use Scenario Outline for repeated examples.',
          '- Use Background only when multiple scenarios share the same setup.',
          '- Do not invent duplicate step text when `list_existing_steps` shows a reusable semantic match.',
        ].join('\n')
      },
      {
        path: '.github/skills/testforge-web-selectors.md',
        content: [
          '---',
          'name: testforge-web-selectors',
          'description: Choose selectors that satisfy TestForge generator and locator audit rules.',
          'applyTo: "**/*.{ts,js}"',
          '---',
          '',
          '# TestForge Web Selectors',
          '',
          'This skill replaces generic CSS-first selector advice with the locator order expected by TestForge-generated page objects and TestForge locator audits.',
          '',
          '## Locator Priority',
          '1. `getLocatorByTestId` for stable `data-testid` or equivalent test id attributes.',
          '2. `getLocatorByRole` with accessible name for interactive controls and landmarks.',
          '3. `getLocatorByLabel` for form fields.',
          '4. `getLocatorByText` for stable user-visible copy.',
          '5. `getLocatorByPlaceholder` when placeholder text is the best available accessible signal.',
          '6. CSS only as fallback when semantic locators are unavailable.',
          '',
          '## Page Object Pattern',
          '- Import locator helpers from `vasu-playwright-utils` when the project uses the TestForge wrapper.',
          '- Keep locators and raw page interactions in page objects, not step definitions.',
          '- Prefer accessible names that match what a user sees or hears.',
          '- Add a stable test id in the app when no reliable semantic locator exists.',
          '',
          '## Avoid',
          '- XPath.',
          '- Raw CSS class selectors as primary locators.',
          '- `nth-child`, generated class names, animation/layout selectors, and deep DOM chains.',
          '- Treating failed `inspect_page_dom` output as proof that a selector exists.',
          '',
          '## Verification',
          '- Use `inspect_page_dom` or `gather_test_context` before creating selectors from a live page.',
          '- Use `verify_selector` for uncertain selectors when a TestForge browser session is active.',
          '- If selector healing changes a page object, rerun the smallest affected tag or feature.',
        ].join('\n')
      },
      {
        path: '.github/skills/testforge-api-testing.md',
        content: [
          '---',
          'name: testforge-api-testing',
          'description: Write API, auth, and network interception tests using TestForge MCP project conventions.',
          'applyTo: "**/*.{feature,ts,js}"',
          '---',
          '',
          '# TestForge API Testing',
          '',
          'This skill adapts API testing guidance to TestForge-scaffolded Playwright-BDD projects. Use it for REST checks, auth setup, storage state, and browser-triggered network assertions.',
          '',
          '## Request API',
          '- Use Playwright `APIRequestContext` rather than axios or node-fetch.',
          '- In TestForge singleton-style steps, prefer `getRequest()` from `vasu-playwright-utils` for pure API calls.',
          '- Fixture destructuring with `request` is allowed when the step explicitly needs Playwright fixtures for an API or interception scenario.',
          '',
          '```typescript',
          "import { getRequest } from 'vasu-playwright-utils';",
          '',
          'const request = getRequest();',
          "const response = await request.post('/api/v1/auth', { data: payload });",
          '```',
          '',
          '## Auth and Secrets',
          '- Use `manage_env` for environment values and never hardcode tokens, passwords, or API keys in Gherkin or step files.',
          '- Acquire auth through API calls when it avoids slow UI login and then save `storageState` when the flow needs a browser session.',
          '- Keep user records in `manage_users` where appropriate; returned secret values are intentionally redacted.',
          '',
          '## Assertions',
          '- Assert exact expected status with `response.status()`.',
          '- Assert `response.ok()` only when any 2xx response is acceptable.',
          '- Validate important JSON fields with deep equality or schema checks.',
          '- Put complex request/response shapes in typed interfaces under `models/`.',
          '',
          '## Browser Network Interception',
          '- Register `page.route` before the browser action that triggers the request.',
          '- Use `Promise.all` with the action and `waitForResponse` to avoid missed responses.',
          '- Keep intercepted API assertions close to the business behavior represented by the scenario.',
        ].join('\n')
      },
      {
        path: '.github/skills/testforge-dom-and-locators.md',
        content: [
          '---',
          'name: testforge-dom-and-locators',
          'description: Inspect pages and choose stable selectors before generating or healing TestForge tests.',
          'applyTo: "**"',
          '---',
          '',
          '# TestForge DOM and Locators',
          '',
          'This skill is specific to TestForge browser/DOM MCP tools. It exists so an LLM uses TestForge inspection context instead of guessing selectors from memory.',
          '',
          '## Workflow',
          '1. Start with `inspect_page_dom` for a single page or `gather_test_context` for multi-page flows.',
          '2. If browser startup fails, run `upgrade_project` or `check_playwright_ready` and follow the exact repair command.',
          '3. If JSON DOM inspection returns an error, do not treat it as cached DOM context.',
          '4. Use `verify_selector` for uncertain selectors when a session is active.',
          '',
          '## Locator Priority',
          '1. `data-testid` or equivalent stable test id.',
          '2. Role plus accessible name.',
          '3. Label for form controls.',
          '4. Stable visible text.',
          '5. CSS only when semantic locators are unavailable.',
          '',
          '## Avoid',
          '- XPath.',
          '- `nth-child` and deep CSS chains.',
          '- Locators tied to animation, layout, or generated class names.',
          '- Claims that DOM was inspected if the MCP tool returned an error.',
          '',
          '## TestForge Failure Signals',
          '- `inspect_page_dom` with `returnFormat:"json"` must return real DOM JSON, not an `[ERROR]` string.',
          '- If `start_session` or `navigate_session` reports browser install failure, fix setup before selector work.',
          '- Cached DOM context is trustworthy only after a successful TestForge DOM inspection.',
        ].join('\n')
      },
      {
        path: '.github/skills/testforge-run-and-heal.md',
        content: [
          '---',
          'name: testforge-run-and-heal',
          'description: Run targeted Playwright-BDD tests through TestForge MCP and heal failures using stored run context.',
          'applyTo: "**"',
          '---',
          '',
          '# TestForge Run and Heal',
          '',
          'This skill is specific to TestForge MCP execution and healing. It is not a generic Playwright command reference.',
          '',
          '## Targeted Execution',
          '- Prefer `run_playwright_test({ projectRoot, tags:"@tag" })` for tagged scenarios.',
          '- Use `specificTestArgs:"features/name.feature --project chromium"` for one feature.',
          '- For long suites, use `detached:true` and poll with `get_test_run_status`.',
          '- Custom `overrideCommand` must be a package script such as `npm run automated-test`.',
          '',
          '## Healing',
          '1. Read the `[FAILURES]` block first.',
          '2. If `LastResultStore` has context, call `self_heal_test` without retyping the full log.',
          '3. For selector failures, inspect DOM before editing locators.',
          '4. For compile failures, fix imports/types before rerunning.',
          '5. After any fix, rerun the smallest affected tag or feature.',
          '',
          '## No-Test Handling',
          '- Treat zero-test output as blocked, not passed.',
          '- Check tag spelling, bddgen generation, feature path, and config path.',
          '',
          '## TestForge Tool Contracts',
          '- `run_playwright_test` sends tag filters to both `bddgen --tags` and Playwright `--grep`.',
          '- Specific `.feature` runs should not let unrelated missing-step features fail generation.',
          '- `get_test_run_status` is the only supported polling path for detached TestForge runs.',
          '- `self_heal_test` should use the latest stored TestForge run context when available.',
        ].join('\n')
      },
      {
        path: '.github/skills/testforge-verification-and-truth.md',
        content: [
          '---',
          'name: testforge-verification-and-truth',
          'description: Verify TestForge work honestly before saying setup, generation, execution, or healing succeeded.',
          'applyTo: "**"',
          '---',
          '',
          '# TestForge Verification and Truth',
          '',
          'This skill is specific to TestForge MCP output truthfulness. It should be used before reporting TestForge setup, generation, execution, or healing as complete.',
          '',
          '## Before Claiming Success',
          '- Confirm the command or MCP tool actually ran in this turn.',
          '- Check exit status, `isError`, and structured result fields.',
          '- Confirm at least one intended test ran when reporting execution success.',
          '- Mention anything not verified.',
          '',
          '## Good Evidence',
          '- `setup_project` returned `SETUP_COMPLETE` with install details successful.',
          '- `validate_and_write` wrote expected files and verification passed.',
          '- `run_playwright_test` shows nonzero passed tests and zero failures.',
          '- `get_test_run_status` reports completed passed run with nonzero tests.',
          '',
          '## Red Flags',
          '- `0 passed, 0 failed`.',
          '- Browser launch errors hidden behind setup success.',
          '- DOM JSON success text after an `[ERROR]` result.',
          '- Dry-run output used as proof that files were written.',
          '- Secret values included in a response.',
          '',
          '## TestForge-Specific Checks',
          '- `validate_and_write(dryRun:true)` means nothing was written.',
          '- `validate_and_write` without dryRun should return a write result and verification output.',
          '- `setup_project` success requires `status:"SETUP_COMPLETE"`, not just created files.',
          '- `run_playwright_test` success requires real nonzero test execution, not only command completion.',
        ].join('\n')
      },
    ];

    for (const file of files) {
      if (this.writeIfMissing(projectRoot, file.path, `${file.content}\n`)) {
        filesCreated.push(file.path);
      }
    }

    return filesCreated;
  }
}
