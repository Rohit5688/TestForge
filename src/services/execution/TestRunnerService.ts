import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ITestRunner, TestRunnerResult, TestRunFilters } from '../../interfaces/ITestRunner.js';
import { sanitizeShellArg } from '../../utils/SecurityUtils.js';
import { withRetry, RetryPolicies } from '../../utils/RetryEngine.js';
import { ExtensionLoader } from '../../utils/ExtensionLoader.js';
import { buildTrustedCommandPlan, parseCommandLine } from '../../utils/CommandPolicy.js';
import { McpErrors } from '../../types/ErrorSystem.js';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

import { McpConfigService } from '../config/McpConfigService.js';
import { EnvManagerService } from '../config/EnvManagerService.js';

function quoteCommandArg(arg: string): string {
  return /[\s"'\\]/.test(arg) ? JSON.stringify(arg) : arg;
}

export function extractFeaturePathsFromArgs(args?: string): string[] {
  if (!args?.trim()) return [];
  const parts = parseCommandLine(args);
  const featurePaths: string[] = [];
  for (const part of parts) {
    const withoutLine = part.replace(/:\d+(:\d+)?$/, '');
    if (withoutLine.endsWith('.feature') && !featurePaths.includes(withoutLine)) {
      featurePaths.push(withoutLine);
    }
  }
  return featurePaths;
}

function extractGrepFromArgs(args?: string): string | undefined {
  if (!args?.trim()) return undefined;
  const parts = parseCommandLine(args);
  for (let i = 0; i < parts.length; i++) {
    if ((parts[i] === '--grep' || parts[i] === '-g') && parts[i + 1]) {
      return parts[i + 1];
    }
  }
  return undefined;
}

/**
 * TestRunnerService
 *
 * Executes Playwright-BDD tests via shell commands.
 * Phase 35: Sanitizes user-supplied test arguments to prevent command injection.
 * Phase 35b: Per-run timeout is config-driven via mcp-config.json (testRunTimeout).
 */
export class TestRunnerService implements ITestRunner {
  private readonly configService: McpConfigService;
  private readonly envManager: EnvManagerService;

  constructor(configService?: McpConfigService, envManager?: EnvManagerService) {
    this.configService = configService || new McpConfigService();
    this.envManager = envManager || new EnvManagerService();
  }

  public async runTests(
    projectRoot: string,
    specificTestArgs?: string,
    timeoutMs?: number,
    executionCommand?: string,
    filters?: TestRunFilters
  ): Promise<TestRunnerResult> {
    const config = this.configService.read(projectRoot);
    const runTimeout = timeoutMs ?? config.timeouts?.testRun ?? DEFAULT_TIMEOUT_MS;
    
    // Load env file per config.currentEnvironment
    const envManager = new EnvManagerService();
    const envResult = envManager.read(projectRoot, config.currentEnvironment);
    const mergedEnv: NodeJS.ProcessEnv = { ...process.env, ...envResult.values, FORCE_COLOR: '0' };

    try {
      // Phase 35: Sanitize user-supplied arguments before shell interpolation
      const safeArgs = specificTestArgs ? sanitizeShellArg(specificTestArgs) : '';
      const safeTags = filters?.tags ? sanitizeShellArg(filters.tags) : extractGrepFromArgs(safeArgs);
      const featurePaths = filters?.featurePaths?.length
        ? filters.featurePaths
        : extractFeaturePathsFromArgs(safeArgs);
      if (safeTags) {
        mergedEnv.TAGS = safeTags;
      }

      const filteredConfig = !executionCommand && !config.executionCommand && featurePaths.length > 0
        ? this.createFeatureFilteredPlaywrightConfig(projectRoot, config.playwrightConfig, featurePaths)
        : undefined;
      const playwrightConfigPath = filteredConfig ?? config.playwrightConfig;
      const bddConfig = playwrightConfigPath ? ` --config ${quoteCommandArg(sanitizeShellArg(playwrightConfigPath))}` : '';
      const pwConfig = playwrightConfigPath ? ` --config ${quoteCommandArg(sanitizeShellArg(playwrightConfigPath))}` : '';
      const bddTags = safeTags ? ` --tags ${quoteCommandArg(safeTags)}` : '';
      let command = `npx bddgen${bddConfig}${bddTags} && npx playwright test${pwConfig}`;

      if (executionCommand) {
        command = executionCommand;
      } else if (config.executionCommand) {
        command = config.executionCommand;
      } else {
        // Auto-detect package manager locally if no custom executionCommand provided
        if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) {
          command = `yarn bddgen${bddConfig}${bddTags} && yarn playwright test${pwConfig}`;
        } else if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) {
          command = `pnpm bddgen${bddConfig}${bddTags} && pnpm exec playwright test${pwConfig}`;
        }
      }
      
      const isPackageRunner = /^(npm|yarn|pnpm|bun)\s+run\b/.test(command.trim());
      const needsSeparator = isPackageRunner && safeArgs;
      // Also apply tsconfig to playwright test if specified
      const tsconfigArg = config.tsconfigPath ? ` --tsconfig ${sanitizeShellArg(config.tsconfigPath)}` : '';
      
      const argsToAppend = (needsSeparator && !command.includes(' -- ')) ? `-- ${safeArgs}` : safeArgs;
      
      // Inject tsconfig safely into playwright command
      const commandWithTsconfig = command.replace(/(playwright test[\S\s]*?)(?=\s*$|&&)/, `$1${tsconfigArg}`);
      const fullCommand = `${commandWithTsconfig} ${argsToAppend}`.trim();

      const commandSegments = buildTrustedCommandPlan(fullCommand);

      let aggregatedStdout = '';
      let aggregatedStderr = '';

      for (const segment of commandSegments) {
        const { exe, args } = segment;
        const isWin = process.platform === 'win32';

        // TF-NEW-02: Retry transient EBUSY / ECONNRESET failures (common on Windows CI)
        const { value: execResult } = await withRetry(
          () => execFileAsync(exe, args, {
            cwd: projectRoot,
            timeout: runTimeout,
            env: mergedEnv,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: isWin
          } as any),
          RetryPolicies.fileWrite
        );
        const { stdout, stderr } = execResult;

        aggregatedStdout += stdout + '\n';
        aggregatedStderr += stderr + '\n';
      }

      const summary = TestRunnerService.parseStructuredSummary(aggregatedStdout + aggregatedStderr);
      const noTestsRan = summary.includes('NO TESTS RAN');
      return {
        passed: !noTestsRan,
        output: summary + `\n\n[RAW OUTPUT]\n${aggregatedStdout.trim()}\n${aggregatedStderr.trim()}` + ExtensionLoader.loadExtensionsForPrompt(projectRoot)
      };
    } catch (error) {
      // Check if the error is a timeout kill
      if (typeof error === 'object' && error !== null && 'killed' in error && error.killed) {
        return {
          passed: false,
          output: `[TIMEOUT] Test run exceeded the ${runTimeout / 1000}s limit and was killed.\n\nPartial Output:\n${(error as any).stdout || ''}\n\nIncrease testRunTimeout in mcp-config.json if your suite needs more time.` + ExtensionLoader.loadExtensionsForPrompt(projectRoot)
        };
      }
      // In JS, exec throws if exit code is not 0, which happens on test failures.
      const msg = error instanceof Error ? error.message : String(error);
      const rawOut = `${(error as any)?.stdout || ''}\n${(error as any)?.stderr || ''}`;
      const summary = TestRunnerService.parseStructuredSummary(rawOut + '\n' + msg);
      return {
        passed: false,
        output: summary + `\n\n[RAW OUTPUT]\n${msg}\n${rawOut}` + ExtensionLoader.loadExtensionsForPrompt(projectRoot)
      };
    }
  }

  private createFeatureFilteredPlaywrightConfig(
    projectRoot: string,
    configuredPlaywrightConfig: string | undefined,
    featurePaths: string[]
  ): string | undefined {
    const originalConfig = this.resolvePlaywrightConfig(projectRoot, configuredPlaywrightConfig);
    if (!originalConfig) return undefined;

    const configDir = path.join(projectRoot, '.TestForge', 'generated-configs');
    fs.mkdirSync(configDir, { recursive: true });

    const normalizedFeatures = featurePaths.map(featurePath => {
      const cleanPath = featurePath.replace(/:\d+(:\d+)?$/, '');
      const absolute = path.isAbsolute(cleanPath)
        ? path.resolve(cleanPath)
        : path.resolve(projectRoot, cleanPath);
      const relative = path.relative(projectRoot, absolute).replace(/\\/g, '/');
      if (relative.startsWith('../') || path.isAbsolute(relative) || !relative.endsWith('.feature')) {
        throw McpErrors.invalidParameter(
          'specificTestArgs',
          `Feature path must be a .feature file inside projectRoot: ${featurePath}`,
          'run_playwright_test'
        );
      }
      return relative;
    });
    const hash = crypto
      .createHash('sha1')
      .update(`${originalConfig}\n${normalizedFeatures.join('\n')}`)
      .digest('hex')
      .slice(0, 12);
    const generatedConfigPath = path.join(configDir, `bdd-filter-${hash}.playwright.config.ts`);
    const relativeOriginal = path.relative(configDir, originalConfig).replace(/\\/g, '/');
    const originalImport = relativeOriginal.startsWith('.') ? relativeOriginal : `./${relativeOriginal}`;
    const bddEnvPath = path.join(projectRoot, 'node_modules', 'playwright-bdd', 'dist', 'config', 'env.js');

    const content = [
      "import { createRequire } from 'node:module';",
      `import originalConfig from ${JSON.stringify(originalImport)};`,
      '',
      'const require = createRequire(import.meta.url);',
      `const { getEnvConfigs } = require(${JSON.stringify(bddEnvPath)});`,
      `const requestedFeatures = ${JSON.stringify(normalizedFeatures, null, 2)};`,
      '',
      'for (const bddConfig of Object.values(getEnvConfigs())) {',
      '  bddConfig.features = requestedFeatures;',
      '}',
      '',
      'export default originalConfig;',
    ].join('\n');

    fs.writeFileSync(generatedConfigPath, content, 'utf-8');
    return path.relative(projectRoot, generatedConfigPath).replace(/\\/g, '/');
  }

  private resolvePlaywrightConfig(projectRoot: string, configuredPlaywrightConfig?: string): string | undefined {
    if (configuredPlaywrightConfig) {
      const configured = path.isAbsolute(configuredPlaywrightConfig)
        ? configuredPlaywrightConfig
        : path.join(projectRoot, configuredPlaywrightConfig);
      return fs.existsSync(configured) ? configured : undefined;
    }

    for (const candidate of [
      'playwright.config.ts',
      'playwright.config.js',
      'playwright.config.mts',
      'playwright.config.mjs',
      'playwright.config.cts',
      'playwright.config.cjs'
    ]) {
      const candidatePath = path.join(projectRoot, candidate);
      if (fs.existsSync(candidatePath)) return candidatePath;
    }
    return undefined;
  }

  /**
   * Parses Playwright/BDD terminal output into a compact structured summary.
   * Prepended before raw output so LLM reads signal first without parsing the full log.
   */
  private static parseStructuredSummary(raw: string): string {
    const lines = raw.split(/\r?\n/);
    let passed = 0, failed = 0, skipped = 0;
    for (const line of lines) {
      const compact = line.match(/PASS\s*\((\d+)\).*FAIL\s*\((\d+)\)/i);
      if (compact) {
        passed = parseInt(compact[1]!, 10);
        failed = parseInt(compact[2]!, 10);
        continue;
      }
      const m = line.match(/(\d+)\s+(passed|failed|skipped)/);
      if (m) {
        const n = parseInt(m[1]!, 10);
        if (m[2] === 'passed') passed = n;
        else if (m[2] === 'failed') failed = n;
        else if (m[2] === 'skipped') skipped = n;
      }
    }
    const failures: { test: string; error: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (/^\s{0,4}●\s+/.test(line)) {
        const testName = line.replace(/^\s*●\s+/, '').trim();
        let errLine = '';
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const candidate = lines[j]!.trim();
          if (candidate.length > 0 && !candidate.startsWith('at ')) {
            errLine = candidate.slice(0, 140);
            break;
          }
        }
        failures.push({ test: testName, error: errLine });
      }
    }
    // Zero-test guard: if nothing ran, flag it — never silently report ✅ PASSED
    if (passed === 0 && failed === 0 && skipped === 0) {
      return `[TEST SUMMARY] ⚠️ NO TESTS RAN | passed: 0 | failed: 0 | skipped: 0\n` +
        `[WARN] 0 tests matched. Possible causes:\n` +
        `  1. TAGS env var not set and executionCommand requires it (e.g. 'npm run automated-test')\n` +
        `  2. --grep filter matched nothing\n` +
        `  3. bddgen specs not regenerated after .feature file changes — run: npx bddgen --config=./src/test/playwright.config.ts\n` +
        `  4. Wrong --config path\n` +
        `Fix: pass tags param to run_playwright_test, or run: npx playwright test --config=./src/test/playwright.config.ts`;
    }
    const status = failed > 0 ? '❌ FAILED' : '✅ PASSED';
    let summary = `[TEST SUMMARY] ${status} | passed: ${passed} | failed: ${failed} | skipped: ${skipped}`;
    if (failures.length > 0) {
      summary += '\n[FAILURES]';
      for (const f of failures) {
        summary += `\n  • ${f.test}`;
        if (f.error) summary += `\n    → ${f.error}`;
      }
      // Auto-classify failure for LLM — eliminates reasoning step
      summary += '\n' + TestRunnerService.classifyErrorDna(raw);
    }
    return summary;
  }

  /**
   * Classifies the raw output into a failure category with a suggested next tool.
   * Emitted as [ERROR DNA] block so LLM skips triage and goes straight to fix.
   */
  private static classifyErrorDna(raw: string): string {
    type DnaEntry = { failureClass: string; reason: string; suggestedTool: string };
    const rules: Array<{ pattern: RegExp; entry: DnaEntry }> = [
      {
        pattern: /element.*not found|locator.*resolved to \d+ element|waiting for getBy|waiting for locator|toBeVisible.*failed|no element.*matching/i,
        entry: { failureClass: 'selector', reason: 'Locator did not resolve to a unique element.', suggestedTool: 'self_heal_test → inspect_page_dom' }
      },
      {
        pattern: /Cannot find module|SyntaxError|error TS\d+|Object is not a function|is not a function|TypeError.*undefined/i,
        entry: { failureClass: 'compile', reason: 'TypeScript/module error — code will not run.', suggestedTool: 'Fix imports/types then re-run' }
      },
      {
        pattern: /Timeout.*exceeded|waiting for.*toContainText|waiting for.*toHaveText|TimeoutError/i,
        entry: { failureClass: 'timing', reason: 'Assertion raced against async DOM update.', suggestedTool: 'analyze_trace → add waitForResponse or waitForSelector' }
      },
      {
        pattern: /net::|ECONNREFUSED|ERR_CONNECTION|fetch failed|network timeout/i,
        entry: { failureClass: 'network', reason: 'App/API unreachable during test.', suggestedTool: 'check_playwright_ready → verify baseUrl' }
      },
      {
        pattern: /Expected.*Received|toContainText.*failed|toHaveText.*failed|toHaveURL.*failed|AssertionError/i,
        entry: { failureClass: 'logic', reason: 'App returned wrong data — not a scripting issue.', suggestedTool: 'export_bug_report → file as app defect' }
      },
    ];

    for (const { pattern, entry } of rules) {
      if (pattern.test(raw)) {
        return `[ERROR DNA] class: ${entry.failureClass} | reason: ${entry.reason} | next: ${entry.suggestedTool}`;
      }
    }
    return `[ERROR DNA] class: unknown | reason: Could not classify. | next: self_heal_test with full rawError`;
  }
}
