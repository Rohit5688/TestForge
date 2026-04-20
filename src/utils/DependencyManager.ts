import { execFile } from 'child_process';
import { promisify } from 'util';
import { withRetry, RetryPolicies } from './RetryEngine.js';

const execFileAsync = promisify(execFile);

export class DependencyManager {
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
    try {
      await withRetry(
        () => execFileAsync(this.resolveExe('npm'), ['install'], {
          cwd: projectRoot,
          timeout: 180_000
        }),
        RetryPolicies.networkCall
      );

      await withRetry(
        () => execFileAsync(this.resolveExe('npx'), ['playwright', 'install', 'chromium', 'firefox', '--with-deps'], {
          cwd: projectRoot,
          timeout: 180_000
        }),
        RetryPolicies.networkCall
      );

      return true;
    } catch (e) {
      return false;
    }
  }
}
