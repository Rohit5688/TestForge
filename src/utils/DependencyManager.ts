import { execFile } from 'child_process';
import { promisify } from 'util';
import { withRetry, RetryPolicies } from './RetryEngine.js';

const execFileAsync = promisify(execFile);

export interface InstallCommandResult {
  name: 'npm install' | 'playwright install';
  command: string;
  success: boolean;
  skipped?: boolean;
  exitCode?: number | string;
  error?: string;
  stderr?: string;
  stdout?: string;
}

export interface DependencyInstallResult {
  success: boolean;
  npmInstalled: boolean;
  browsersInstalled: boolean;
  steps: InstallCommandResult[];
}

type ExecFileRunner = (
  file: string,
  args: string[],
  options: { cwd: string; timeout: number }
) => Promise<unknown>;

function compactOutput(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return undefined;
  return text.length <= 1200 ? text : text.slice(0, 1200) + '\n... [truncated]';
}

export class DependencyManager {
  constructor(private readonly execFileRunner: ExecFileRunner = execFileAsync) {}

  /**
   * Windows package manager shim: npm/npx need .cmd extension for execFile.
   */
  private resolveExe(name: string): string {
    return process.platform === 'win32' ? `${name}.cmd` : name;
  }

  /**
   * Installs npm dependencies and Playwright browsers.
   */
  public async installDependencies(projectRoot: string): Promise<boolean> {
    return (await this.installDependenciesDetailed(projectRoot)).success;
  }

  public async installDependenciesDetailed(projectRoot: string): Promise<DependencyInstallResult> {
    const npmStep = await this.runCommand(
      'npm install',
      this.resolveExe('npm'),
      ['install'],
      projectRoot,
      180_000
    );

    if (!npmStep.success) {
      const browserStep: InstallCommandResult = {
        name: 'playwright install',
        command: 'npx playwright install chromium firefox --with-deps',
        success: false,
        skipped: true,
        error: 'Skipped because npm install failed.'
      };
      return {
        success: false,
        npmInstalled: false,
        browsersInstalled: false,
        steps: [npmStep, browserStep]
      };
    }

    const browserStep = await this.runCommand(
      'playwright install',
      this.resolveExe('npx'),
      ['playwright', 'install', 'chromium', 'firefox', '--with-deps'],
      projectRoot,
      180_000
    );

    return {
      success: npmStep.success && browserStep.success,
      npmInstalled: npmStep.success,
      browsersInstalled: browserStep.success,
      steps: [npmStep, browserStep]
    };
  }

  private async runCommand(
    name: InstallCommandResult['name'],
    executable: string,
    args: string[],
    projectRoot: string,
    timeout: number
  ): Promise<InstallCommandResult> {
    const command = `${executable} ${args.join(' ')}`;
    try {
      await withRetry(
        () => this.execFileRunner(executable, args, {
          cwd: projectRoot,
          timeout
        }),
        RetryPolicies.networkCall
      );

      return { name, command, success: true };
    } catch (error: any) {
      const result: InstallCommandResult = {
        name,
        command,
        success: false,
        exitCode: error?.code ?? error?.signal,
        error: error?.message ?? String(error)
      };
      const stderr = compactOutput(error?.stderr);
      const stdout = compactOutput(error?.stdout);
      if (stderr) result.stderr = stderr;
      if (stdout) result.stdout = stdout;
      return result;
    }
  }
}
