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

      return {
        passed: true,
        output: `[SUCCESS] Tests passed!\n\nStandard Output:\n${aggregatedStdout.trim()}\n\nStandard Error:\n${aggregatedStderr.trim()}` + ExtensionLoader.loadExtensionsForPrompt(projectRoot)
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
      return {
        passed: false,
        output: `[FAILED] Tests failed or failed to compile.\n\nCommand Error:\n${msg}\n\nStandard Output:\n${(error as any)?.stdout || ''}\n\nStandard Error:\n${(error as any)?.stderr || ''}` + ExtensionLoader.loadExtensionsForPrompt(projectRoot)
      };
    }
  }
}
