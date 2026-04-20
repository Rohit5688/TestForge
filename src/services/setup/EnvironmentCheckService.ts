import { Questioner } from '../../utils/Questioner.js';
import { ExtensionLoader } from '../../utils/ExtensionLoader.js';
import type { EnvironmentCheck } from '../env/EnvTypes.js';
import { EnvUtils } from '../env/EnvUtils.js';
import { NodeEnvChecker } from '../env/NodeEnvChecker.js';
import { PlaywrightEnvChecker } from '../env/PlaywrightEnvChecker.js';
import { ConfigEnvChecker } from '../env/ConfigEnvChecker.js';

export interface EnvironmentReport {
  ready: boolean;
  checks: EnvironmentCheck[];
  summary: string;
  failCount: number;
  warnCount: number;
}

export type { EnvironmentCheck }; // Re-export for dependents

/**
 * EnvironmentCheckService — Pre-flight check for Playwright-BDD web automation.
 * Verifies: Node.js version, @playwright/test installed, browsers downloaded,
 * BASE_URL reachable, playwright.config.ts present, mcp-config.json, node_modules.
 */
export class EnvironmentCheckService {

  public async check(projectRoot: string, baseUrl?: string): Promise<EnvironmentReport> {
    const checks: EnvironmentCheck[] = [];

    // Parse individual env vars from .env if it exists
    const localEnv = EnvUtils.loadLocalEnv(projectRoot);

    // 1. Node.js version
    checks.push(await NodeEnvChecker.checkNode());

    // 2. Playwright package installed in project
    checks.push(PlaywrightEnvChecker.checkPlaywrightInstalled(projectRoot));

    // 3. Playwright browsers downloaded
    checks.push(await PlaywrightEnvChecker.checkBrowsersDownloaded(projectRoot));

    // 4. playwright.config.ts exists
    checks.push(ConfigEnvChecker.checkPlaywrightConfig(projectRoot));

    // 5. mcp-config.json exists
    checks.push(ConfigEnvChecker.checkMcpConfig(projectRoot));

    // 6. node_modules present
    checks.push(NodeEnvChecker.checkNodeModules(projectRoot));

    // 7. BASE_URL reachable (only if provided)
    if (baseUrl) {
      const urlCheck = await ConfigEnvChecker.checkBaseUrl(baseUrl);
      checks.push(urlCheck);
      if (urlCheck.status === 'fail') {
        Questioner.clarify(
          `BASE_URL "${baseUrl}" is not reachable. Should we update it?`,
          'Tests cannot run against an unreachable URL. Verify the app is running or the URL is correct.',
          ['Update BASE_URL in .env', 'Start the app server first', 'Skip — URL will be set later']
        );
      }
    } else {
      checks.push(await ConfigEnvChecker.checkEnvBaseUrl(projectRoot));
    }

    const failing = checks.filter(c => c.status === 'fail');
    const warnings = checks.filter(c => c.status === 'warn');
    const ready = failing.length === 0;
    const summary = this.buildSummary(checks, ready, failing.length, warnings.length) + ExtensionLoader.loadExtensionsForPrompt(projectRoot);

    return {
      ready,
      checks,
      summary,
      failCount: failing.length,
      warnCount: warnings.length
    };
  }

  // ─── Summary Builder ─────────────────────────────

  private buildSummary(checks: EnvironmentCheck[], ready: boolean, failCount: number, warnCount: number): string {
    const lines: string[] = [];
    lines.push(ready
      ? '✅ Environment is ready for Playwright testing!'
      : '❌ Environment has issues that must be fixed before tests can run.'
    );
    lines.push('');

    for (const check of checks) {
      const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '🟡' : '❌';
      lines.push(`${icon} ${check.name}: ${check.message}`);
    }

    const fixable = checks.filter(c => c.status === 'fail' && c.fixHint);
    if (fixable.length > 0) {
      lines.push('');
      lines.push('─── Quick Fix Guide ───');
      for (const check of fixable) {
        lines.push('');
        lines.push(`🔧 ${check.name}:`);
        lines.push(check.fixHint!);
      }
    }

    if (warnCount > 0 && failCount === 0) {
      lines.push('');
      lines.push(`⚠️ ${warnCount} warning(s) — tests may still run, but consider addressing them.`);
    }

    return lines.join('\n');
  }
}
