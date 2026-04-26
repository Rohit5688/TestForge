import { McpErrors, McpError, McpErrorCode } from '../../types/ErrorSystem.js';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ITestRunner, TestRunnerResult } from '../../interfaces/ITestRunner.js';
import { sanitizeShellArg } from '../../utils/SecurityUtils.js';
import { ShellSecurityEngine } from '../../utils/ShellSecurityEngine.js';
import { withRetry, RetryPolicies } from '../../utils/RetryEngine.js';
import { ExtensionLoader } from '../../utils/ExtensionLoader.js';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

import { McpConfigService } from '../config/McpConfigService.js';
import { EnvManagerService } from '../config/EnvManagerService.js';

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
    executionCommand?: string
  ): Promise<TestRunnerResult> {
    const config = this.configService.read(projectRoot);
    const runTimeout = timeoutMs ?? config.timeouts?.testRun ?? DEFAULT_TIMEOUT_MS;
    
    // Load env file per config.currentEnvironment
    const envManager = new EnvManagerService();
    const envResult = envManager.read(projectRoot, config.currentEnvironment);
    const mergedEnv = { ...process.env, ...envResult.values, FORCE_COLOR: '0' };

    try {
      // Phase 35: Sanitize user-supplied arguments before shell interpolation
      const safeArgs = specificTestArgs ? sanitizeShellArg(specificTestArgs) : '';

      const bddConfig = config.playwrightConfig ? ` --config ${sanitizeShellArg(config.playwrightConfig)}` : '';
      const pwConfig = config.playwrightConfig ? ` --config ${sanitizeShellArg(config.playwrightConfig)}` : '';
      let command = `npx bddgen${bddConfig} && npx playwright test${pwConfig}`;

      if (executionCommand) {
        command = executionCommand;
      } else {
        // Auto-detect package manager locally if no custom executionCommand provided
        if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) {
          command = `yarn bddgen${bddConfig} && yarn playwright test${pwConfig}`;
        } else if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) {
          command = `pnpm bddgen${bddConfig} && pnpm exec playwright test${pwConfig}`;
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

      const commandSegments = fullCommand.split('&&').map(c => c.trim()).filter(Boolean);

      let aggregatedStdout = '';
      let aggregatedStderr = '';

      for (const cmdStr of commandSegments) {
        const parts = cmdStr.split(/\s+/).filter(p => p.length > 0);
        let exe = parts.shift();
        if (!exe) throw McpErrors.invalidExecutable(cmdStr);
        
        // Prevent path traversal in executable
        if (exe.includes('..') || (exe.includes('/') && !exe.startsWith('/'))) {
          throw McpErrors.invalidExecutable(exe);
        }

        // On Windows, package managers often need .cmd extension for execFile
        const isWin = process.platform === 'win32';
        if (isWin && ['npm', 'npx', 'yarn', 'pnpm', 'bun'].includes(exe)) {
          exe = `${exe}.cmd`;
        }

        const args = parts;

        // TASK-48: Defense-in-depth — validate args with ShellSecurityEngine
        // execFile already prevents shell metacharacter interpolation at the OS
        // level, but this catches adversarial inputs before they reach the kernel.
        const securityCheck = ShellSecurityEngine.validateArgs(args);
        if (!securityCheck.safe) {
          throw McpErrors.shellInjectionDetected(
            `\n⛔ SHELL SECURITY VIOLATION in command segment "${cmdStr}":\n` +
            ShellSecurityEngine.formatViolations(securityCheck)
          );
        }

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
      return {
        passed: true,
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

  /**
   * Parses Playwright/BDD terminal output into a compact structured summary.
   * Prepended before raw output so LLM reads signal first without parsing the full log.
   */
  private static parseStructuredSummary(raw: string): string {
    const lines = raw.split(/\r?\n/);
    let passed = 0, failed = 0, skipped = 0;
    for (const line of lines) {
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
