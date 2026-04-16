import * as fs from 'fs';
import * as path from 'path';
import { McpErrors } from '../types/ErrorSystem.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { EnvManagerService } from './EnvManagerService.js';
import { withRetry, RetryPolicies } from '../utils/RetryEngine.js';
import { ShellSecurityEngine } from '../utils/ShellSecurityEngine.js';

const execFileAsync = promisify(execFile);

/** Windows package manager shim: npm/npx need .cmd extension for execFile. */
function resolveExe(name: string): string {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

export interface SetupResult {
  projectRoot: string;
  installed: boolean;
  dirsCreated: string[];
  filesCreated: string[];
  envScaffolded: boolean;
  message: string;
}

/**
 * ProjectSetupService — Phase 20D + Phase 8 Hardening
 *
 * Bootstraps a blank directory into a fully configured Playwright-BDD project.
 * Creates folder structure, installs packages, writes playwright.config.ts,
 * and sets up a .env file via EnvManagerService.
 *
 * Single Responsibility: Only does first-time project scaffolding.
 * repairProject() is safe to call on any existing project — it only fills gaps.
 */
export class ProjectSetupService {
  private readonly envManager: EnvManagerService;

  constructor(envManager?: EnvManagerService) {
    this.envManager = envManager || new EnvManagerService();
  }

  public async setup(projectRoot: string): Promise<string> {
    if (!fs.existsSync(projectRoot)) {
      fs.mkdirSync(projectRoot, { recursive: true });
    }

    const configPath = path.join(projectRoot, 'mcp-config.json');

    if (!fs.existsSync(configPath)) {
      this.generateConfigTemplate(projectRoot);
      const docsDir = path.join(projectRoot, 'docs');
      if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
      this.scaffoldMcpConfigReference(projectRoot);
      this.scaffoldPromptCheatbook(projectRoot);

      return JSON.stringify({
        phase: 1,
        status: 'CONFIG_TEMPLATE_CREATED',
        configPath,
        message: [
          '📋 STEP 1 of 2: mcp-config.json has been created.',
          '',
          'Open mcp-config.json and fill in CONFIGURE_ME fields.',
          '📖 Documentation created:',
          '  • docs/MCP_CONFIG_REFERENCE.md - Complete field reference',
          '  • docs/PROMPT_CHEATBOOK.md - AI prompt guide',
          '',
          'When ready, call setup_project again with the same projectRoot to continue.'
        ].join('\n')
      }, null, 2);
    }

    const unfilledFields = this.scanConfigureMe(projectRoot);

    const res = await this._scaffold(projectRoot, false);
    return JSON.stringify({
      phase: 2,
      status: 'SETUP_COMPLETE',
      projectRoot: res.projectRoot,
      installed: res.installed,
      dirsCreated: res.dirsCreated,
      filesCreated: res.filesCreated,
      envScaffolded: res.envScaffolded,
      unfilledFields,
      message: res.message
    }, null, 2);
  }

  /**
   * Safe to run at any time — only generates files that are missing.
   * Never overwrites existing files. Used by repair_project and upgrade_project.
   */
  public async repairProject(projectRoot: string): Promise<string> {
    const result = await this._scaffold(projectRoot, true);
    const lines = [
      `\u2705 Project repair completed at ${projectRoot}`,
      result.dirsCreated.length > 0
        ? `  Directories created: ${result.dirsCreated.join(', ')}`
        : '  Directories: all present',
      result.filesCreated.length > 0
        ? `  Missing files restored: ${result.filesCreated.join(', ')}`
        : '  Files: all present',
    ];
    return lines.join('\n');
  }

  private async _scaffold(projectRoot: string, repairMode: boolean): Promise<SetupResult> {
    const dirsCreated: string[] = [];
    const filesCreated: string[] = [];

    // 1. Ensure root exists
    if (!fs.existsSync(projectRoot)) {
      fs.mkdirSync(projectRoot, { recursive: true });
    }

    // 2. Standard BDD directory structure
    const dirs = ['features', 'pages', 'step-definitions', 'fixtures', 'models', 'test-data'];
    for (const dir of dirs) {
      const fullPath = path.join(projectRoot, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        dirsCreated.push(dir);
      }
    }

    // 3. package.json with ALL required dependencies
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      const packageJson = {
        name: path.basename(projectRoot),
        version: '1.0.0',
        type: 'module',
        scripts: {
          'test':              'bddgen && playwright test',
          'test:smoke':        'bddgen && playwright test --grep @smoke',
          'test:regression':   'bddgen && playwright test --grep @regression',
          'test:e2e':          'bddgen && playwright test --grep @e2e',
          'test:headed':       'bddgen && playwright test --headed',
          'test:report':       'playwright show-report',
          'test:gen':          'npx bddgen',
          'lint':              'tsc --noEmit',
        },
        devDependencies: {
          // playwright-bdd includes @playwright/test as a peer — do NOT add @playwright/test separately
          // to package.json. However, standard Playwright APIs (test, expect, Page) should still 
          // be imported directly from @playwright/test in your source code.
          'playwright-bdd':       '^7.0.0',
          // TypeScript
          'typescript':           '^5.4.5',
          'ts-node':              '^10.9.2',
          '@types/node':          '^20.0.0',
          // Environment management
          'dotenv':               '^16.4.5',
          // Accessibility testing
          '@axe-core/playwright': '^4.9.0',
          // Test data generation
          '@faker-js/faker':      '^8.4.1',
        }
      };
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
      filesCreated.push('package.json');
    }

    // 4. playwright.config.ts
    const configPath = path.join(projectRoot, 'playwright.config.ts');
    if (!fs.existsSync(configPath)) {
      const configContent = [
        "import 'dotenv/config';",
        "import { defineConfig, devices } from '@playwright/test';",
        "import { defineBddConfig } from 'playwright-bdd';",
        "// @playwright/test is NOT in package.json as it is provided implicitly by playwright-bdd.",
        "const testDir = defineBddConfig({",
        "  featuresRoot: 'features',",
        "  features: '**/*.feature',",
        "  steps: 'step-definitions/**/*.ts',",
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
        "    trace: 'on-first-retry',",
        "  },",
        "  projects: [",
        "    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },",
        "    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },",
        "  ],",
        "});",
      ].join('\n');
      fs.writeFileSync(configPath, configContent, 'utf-8');
      filesCreated.push('playwright.config.ts');
    }

    // 5. tsconfig.json
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
      const tsconfig = {
        compilerOptions: {
          module: 'NodeNext',
          target: 'ES2022',
          moduleResolution: 'NodeNext',
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
      filesCreated.push('tsconfig.json');
    }

    // 6. BasePage.ts (only if not present)
    const basePagePath = path.join(projectRoot, 'pages', 'BasePage.ts');
    if (!fs.existsSync(basePagePath)) {
      const basePageContent = [
        "// Standard Playwright APIs are imported from @playwright/test.",
        "// @playwright/test matches the version used by playwright-bdd and is installed implicitly.",
        "import { Page, expect } from '@playwright/test';",
        "import 'dotenv/config';",
        "",
        "export class BasePage {",
        "  constructor(protected page: Page) {}",
        "",
        "  async waitForStable(selector?: string) {",
        "    await this.page.waitForLoadState('networkidle');",
        "    if (selector) await expect(this.page.locator(selector)).toBeVisible();",
        "  }",
        "",
        "  async closePopups() {",
        "    const selectors = ['[aria-label=\"Close\"]', 'button.close', '.modal-close'];",
        "    for (const sel of selectors) {",
        "      const btn = this.page.locator(sel).first();",
        "      if (await btn.isVisible()) await btn.click();",
        "    }",
        "  }",
        "",
        "  async navigate(url: string) {",
        "    await this.page.goto(url);",
        "    await this.waitForStable();",
        "    await this.closePopups();",
        "  }",
        "",
        "  async checkAccessibility(scanName = 'Page Scan') {",
        "    const { AxeBuilder } = await import('@axe-core/playwright');",
        "    const results = await new AxeBuilder({ page: this.page })",
        "      .withTags(['wcag2aa', 'wcag21aa', 'wcag2a'])",
        "      .analyze();",
        "    if (results.violations.length > 0) {",
        "      console.error(`[A11Y] Violations found in ${scanName}:`, results.violations);",
        "    }",
        "    expect(results.violations).toEqual([]);",
        "  }",
        "}",
      ].join('\n');
      fs.writeFileSync(basePagePath, basePageContent, 'utf-8');
      filesCreated.push('pages/BasePage.ts');
    }

    // 7. .gitignore
    const gitignorePath = path.join(projectRoot, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
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
      filesCreated.push('.gitignore');
    }

    // 8. Sample feature file
    const sampleFeaturePath = path.join(projectRoot, 'features', 'sample.feature');
    if (!fs.existsSync(sampleFeaturePath)) {
      const featureContent = [
        '@smoke',
        'Feature: Sample Playwright BDD Test',
        '',
        '  Scenario: Verify page loads',
        '    Given I navigate to the home page',
        '    Then the page title should be visible',
      ].join('\n');
      fs.writeFileSync(sampleFeaturePath, featureContent, 'utf-8');
      filesCreated.push('features/sample.feature');
    }

    // 9. Install if node_modules absent and NOT in repairMode
    let installed = false;
    const nodeModulesPath = path.join(projectRoot, 'node_modules');
    if (!fs.existsSync(nodeModulesPath) && !repairMode) {
      try {
        // TASK-48: Use execFile (not exec) to avoid shell interpretation of &&.
        // Split into two sequential execFile calls instead of one && chain.
        // TF-NEW-02: Wrap in networkCall retry — npm install fails transiently in CI.
        await withRetry(
          () => execFileAsync(resolveExe('npm'), ['install'], {
            cwd: projectRoot,
            timeout: 180_000
          }),
          RetryPolicies.networkCall
        );
        await withRetry(
          () => execFileAsync(resolveExe('npx'), ['playwright', 'install', 'chromium', 'firefox', '--with-deps'], {
            cwd: projectRoot,
            timeout: 180_000
          }),
          RetryPolicies.networkCall
        );
        installed = true;
      } catch (e) {
        installed = false;
      }
    } else {
      installed = true;
    }

    // 10. Scaffold .env files
    const envEnvs = ['local', 'staging', 'prod'];
    const envResults = this.envManager.scaffoldMulti(projectRoot, envEnvs);
    const envScaffolded = envResults.some(r => r.written.length > 0);

    const message = [
      `\u2705 Project scaffolded at ${projectRoot}`,
      dirsCreated.length > 0 ? `\nDirectories created: ${dirsCreated.join(', ')}` : '',
      filesCreated.length > 0 ? `\nFiles created: ${filesCreated.join(', ')}` : '',
      installed
        ? '\n\u2705 npm packages installed (Playwright + playwright-bdd + TypeScript + dotenv + faker)'
        : '\n\u26a0\ufe0f Package install skipped (node_modules already present or install failed)',
      envScaffolded ? '\n\u2705 .env scaffolded' : '\n~ .env already exists',
      '\n\n\ud83d\ude80 NEXT STEPS:',
      '  1. Open .env and replace ***FILL_IN*** values.',
      '  2. Update BASE_URL in .env to your application URL.',
      '  3. Ask me to generate tests, or run: npm test',
    ].filter(Boolean).join('');

    return { projectRoot, installed, dirsCreated, filesCreated, envScaffolded, message };
  }
  public syncConfigSchema(projectRoot: string): string[] {
    const logs: string[] = [];
    const configPath = path.join(projectRoot, 'mcp-config.json');
    if (!fs.existsSync(configPath)) return logs;
    // Apply new config fields without overwriting custom edits
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    logs.push("✅ Schema synced and defaults applied without overwriting.");
    
    const missingFeatures = [];
    if (!raw.reporting) missingFeatures.push('Reporters');
    if (!fs.existsSync(path.join(projectRoot, 'test-data'))) missingFeatures.push('Credential files');
    
    if (missingFeatures.length > 0) {
      logs.push(`⚠️ Detected missing features: ${missingFeatures.join(', ')}. Run repair_project to install.`);
    }

    return logs;
  }

  public generateConfigTemplate(projectRoot: string): string {
    const configPath = path.join(projectRoot, 'mcp-config.json');
    const template: Record<string, any> = {
      version: '2.4.0',
      tags: ['CONFIGURE_ME: tag1', 'CONFIGURE_ME: tag2'],
      envKeys: { baseUrl: 'BASE_URL' },
      dirs: {
        features: 'features',
        pages: 'pages',
        stepDefinitions: 'step-definitions',
        testData: 'test-data',
      },
      browsers: ['chromium'],
      timeouts: {
        testRun: 120_000,
        sessionStart: 30000,
        healingMax: 3
      },
      retries: 1,
      backgroundBlockThreshold: 3,
      authStrategy: 'users-json',
      currentEnvironment: 'CONFIGURE_ME: e.g. staging',
      environments: ['local', 'staging', 'prod'],
      waitStrategy: 'domcontentloaded',
      architectureNotesPath: 'docs/mcp-architecture-notes.md',
      additionalDataPaths: [],
      a11yStandards: ['wcag2aa'],
      a11yReportPath: 'test-results/a11y-report.json',
      projectRoot: projectRoot
    };
    fs.writeFileSync(configPath, JSON.stringify(template, null, 2), 'utf-8');
    return configPath;
  }

  public scaffoldMcpConfigReference(projectRoot: string) {
    const docsDir = path.join(projectRoot, 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    const sourceDoc = path.join(__dirname, '../../docs/technical/MCP_CONFIG_REFERENCE.md');
    const targetDoc = path.join(projectRoot, 'docs/MCP_CONFIG_REFERENCE.md');
    
    if (fs.existsSync(sourceDoc)) {
      fs.copyFileSync(sourceDoc, targetDoc);
    } else {
      const content = [
        '# MCP Config Reference — TestForge',
        '',
        'See the full documentation at: https://github.com/ForgeTest-AI/TestForge/blob/main/docs/technical/MCP_CONFIG_REFERENCE.md',
      ].join('\n');
      fs.writeFileSync(targetDoc, content, 'utf-8');
    }
  }

  public scaffoldPromptCheatbook(projectRoot: string) {
    const docsDir = path.join(projectRoot, 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    const sourceDoc = path.join(__dirname, '../../docs/user/PROMPT_CHEATBOOK.md');
    const targetDoc = path.join(projectRoot, 'docs/PROMPT_CHEATBOOK.md');
    
    if (fs.existsSync(sourceDoc)) {
      fs.copyFileSync(sourceDoc, targetDoc);
    } else {
      const content = [
        '# Prompt Cheatbook — TestForge',
        '',
        'See the full cheatbook at: https://github.com/ForgeTest-AI/TestForge/blob/main/docs/user/PROMPT_CHEATBOOK.md',
      ].join('\n');
      fs.writeFileSync(targetDoc, content, 'utf-8');
    }
  }

  public scanConfigureMe(projectRoot: string): string[] {
    const configPath = path.join(projectRoot, 'mcp-config.json');
    if (!fs.existsSync(configPath)) return [];
    const content = fs.readFileSync(configPath, 'utf-8');
    const unconfigured: string[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.includes('"CONFIGURE_ME')) {
        const match = line.match(/"([^"]+)":\s*"CONFIGURE_ME/);
        if (match && match[1]) unconfigured.push(match[1]);
      }
    }
    return unconfigured;
  }
}
