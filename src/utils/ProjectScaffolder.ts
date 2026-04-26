import * as fs from 'fs';
import * as path from 'path';

export class ProjectScaffolder {
  /**
   * Ensures the standard TestForge directory structure exists.
   */
  public scaffoldDirectories(projectRoot: string): string[] {
    const dirsCreated: string[] = [];
    const dirs = ['features', 'pages', 'step-definitions', 'fixtures', 'models', 'test-data', 'test-setup', '.claude/skills', '.claude/agents', '.cursor/rules'];

    for (const dir of dirs) {
      const fullPath = path.join(projectRoot, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        dirsCreated.push(dir);
      }
    }
    return dirsCreated;
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
      '@smoke',
      'Feature: Sample Playwright BDD Test',
      '',
      '  Scenario: Verify page loads',
      '    Given I navigate to the home page',
      '    Then the page title should be visible',
    ].join('\n');
    fs.writeFileSync(sampleFeaturePath, featureContent, 'utf-8');
    return true;
  }
}
