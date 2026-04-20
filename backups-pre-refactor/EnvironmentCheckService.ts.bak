import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import * as https from 'https';
import { Questioner } from '../utils/Questioner.js';
import { ExtensionLoader } from '../utils/ExtensionLoader.js';

const execFileAsync = promisify(execFile);

export interface EnvironmentCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  fixHint?: string | undefined;
}

export interface EnvironmentReport {
  ready: boolean;
  checks: EnvironmentCheck[];
  summary: string;
  failCount: number;
  warnCount: number;
}

/**
 * EnvironmentCheckService — Pre-flight check for Playwright-BDD web automation.
 * Verifies: Node.js version, @playwright/test installed, browsers downloaded,
 * BASE_URL reachable, playwright.config.ts present, mcp-config.json, node_modules.
 */
export class EnvironmentCheckService {

  public async check(projectRoot: string, baseUrl?: string): Promise<EnvironmentReport> {
    const checks: EnvironmentCheck[] = [];
    
    // Parse individual env vars from .env if it exists
    const localEnv = this.loadLocalEnv(projectRoot);

    // 1. Node.js version
    checks.push(await this.checkNode());

    // 2. Playwright package installed in project
    checks.push(this.checkPlaywrightInstalled(projectRoot));

    // 3. Playwright browsers downloaded
    checks.push(await this.checkBrowsersDownloaded(projectRoot));

    // 4. playwright.config.ts exists
    checks.push(this.checkPlaywrightConfig(projectRoot));

    // 5. mcp-config.json exists
    checks.push(this.checkMcpConfig(projectRoot));

    // 6. node_modules present
    checks.push(this.checkNodeModules(projectRoot));

    // 7. BASE_URL reachable (only if provided)
    if (baseUrl) {
      const urlCheck = await this.checkBaseUrl(baseUrl);
      checks.push(urlCheck);
      if (urlCheck.status === 'fail') {
        Questioner.clarify(
          `BASE_URL "${baseUrl}" is not reachable. Should we update it?`,
          'Tests cannot run against an unreachable URL. Verify the app is running or the URL is correct.',
          ['Update BASE_URL in .env', 'Start the app server first', 'Skip — URL will be set later']
        );
      }
    } else {
      checks.push(await this.checkEnvBaseUrl(projectRoot));
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

  private loadLocalEnv(projectRoot: string): Record<string, string> {
    const envPath = path.join(projectRoot, '.env');
    const vars: Record<string, string> = {};
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
          if (match && match[1]) {
            let value = match[2] || '';
            // Remove quotes and comments
            value = value.replace(/#.*$/, '').trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
              value = value.substring(1, value.length - 1);
            }
            vars[match[1]] = value;
          }
        }
      } catch {
        // Ignore parsing errors
      }
    }
    return vars;
  }

  // ─── Individual Checks ─────────────────────────────

  private async checkNode(): Promise<EnvironmentCheck> {
    try {
      const { stdout } = await execFileAsync('node', ['--version']);
      const version = stdout.trim();
      const major = parseInt((version.replace('v', '').split('.')[0]) ?? '0', 10);
      if (major < 18) {
        return {
          name: 'Node.js',
          status: 'warn',
          message: `${version} — Playwright requires Node.js v18+`,
          fixHint: 'Upgrade Node.js:\n  nvm install 20\n  nvm use 20\nOr download from https://nodejs.org'
        };
      }
      return { name: 'Node.js', status: 'pass', message: version };
    } catch {
      return {
        name: 'Node.js',
        status: 'fail',
        message: 'Node.js not found',
        fixHint: 'Install from https://nodejs.org or use nvm:\n  nvm install 20\n  nvm use 20'
      };
    }
  }

  private checkPlaywrightInstalled(projectRoot: string): EnvironmentCheck {
    // playwright-bdd is the correct package — it re-exports @playwright/test.
    // @playwright/test should NOT be in devDependencies alongside playwright-bdd;
    // it causes duplicate runner instances → 'describe() unexpectedly called' errors.
    const bddPath = path.join(projectRoot, 'node_modules', 'playwright-bdd', 'package.json');
    const pwDirectPath = path.join(projectRoot, 'node_modules', '@playwright', 'test', 'package.json');

    if (fs.existsSync(bddPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(bddPath, 'utf8'));
        const msg = `playwright-bdd v${pkg.version} installed`;

        // Warn if @playwright/test is ALSO explicitly in devDependencies (conflict risk)
        if (fs.existsSync(pwDirectPath)) {
          const projPkg = path.join(projectRoot, 'package.json');
          if (fs.existsSync(projPkg)) {
            try {
              const projDeps = JSON.parse(fs.readFileSync(projPkg, 'utf8'));
              const directDeps = { ...(projDeps.devDependencies ?? {}), ...(projDeps.dependencies ?? {}) };
              if ('@playwright/test' in directDeps) {
                return {
                  name: 'Playwright Setup',
                  status: 'warn' as const,
                  message: `${msg} — but @playwright/test is also in devDependencies!`,
                  fixHint: [
                    'Remove @playwright/test from devDependencies — playwright-bdd already re-exports it.',
                    'Having both causes "describe() unexpectedly called" and fixture duplication errors:',
                    '  npm uninstall @playwright/test',
                    'Then reinstall: npm install',
                  ].join('\n')
                };
              }
            } catch { /* ignore parse errors */ }
          }
        }
        return { name: 'Playwright Setup', status: 'pass', message: msg };
      } catch {
        return { name: 'Playwright Setup', status: 'pass', message: 'playwright-bdd installed' };
      }
    }

    return {
      name: 'Playwright Setup',
      status: 'fail',
      message: 'playwright-bdd not found in node_modules',
      fixHint: [
        `Install dependencies:\n  cd ${projectRoot}\n  npm install`,
        'Or install specifically (do NOT add @playwright/test — playwright-bdd includes it):',
        '  npm install --save-dev playwright-bdd',
      ].join('\n')
    };
  }

  private async checkBrowsersDownloaded(projectRoot: string): Promise<EnvironmentCheck> {
    const localEnv = this.loadLocalEnv(projectRoot);
    const localBrowsersDir = path.join(projectRoot, 'node_modules', 'playwright', '.local-browsers');
    const home = os.homedir();
    
    const globalCacheDir = localEnv['PLAYWRIGHT_BROWSERS_PATH'] ?? 
      process.env['PLAYWRIGHT_BROWSERS_PATH'] ??
      (process.platform === 'win32'
        ? path.join(process.env['LOCALAPPDATA'] ?? path.join(home, 'AppData', 'Local'), 'ms-playwright')
        : process.platform === 'darwin'
          ? path.join(home, 'Library', 'Caches', 'ms-playwright')
          : path.join(home, '.cache', 'ms-playwright'));

    if (fs.existsSync(localBrowsersDir) || fs.existsSync(globalCacheDir)) {
      const dirs = fs.existsSync(localBrowsersDir)
        ? fs.readdirSync(localBrowsersDir)
        : fs.readdirSync(globalCacheDir);
      const browsers = dirs.filter(d => d.startsWith('chromium') || d.startsWith('firefox') || d.startsWith('webkit'));
      if (browsers.length > 0) {
        return { name: 'Playwright Browsers', status: 'pass', message: `${browsers.length} browser(s) downloaded: ${browsers.join(', ')}` };
      }
    }

    try {
      // Let playwright itself tell us
      const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      await execFileAsync(npxCmd, ['playwright', '--version'], { cwd: projectRoot });
      return {
        name: 'Playwright Browsers',
        status: 'warn',
        message: 'Could not verify browser binaries location',
        fixHint: 'Run:\n  npx playwright install chromium firefox\n  or: npx playwright install --with-deps'
      };
    } catch {
      return {
        name: 'Playwright Browsers',
        status: 'fail',
        message: 'No browser binaries found',
        fixHint: 'Install browsers:\n  npx playwright install chromium firefox\n  or: npx playwright install --with-deps'
      };
    }
  }

  private checkPlaywrightConfig(projectRoot: string): EnvironmentCheck {
    const configTs = path.join(projectRoot, 'playwright.config.ts');
    const configJs = path.join(projectRoot, 'playwright.config.js');
    if (fs.existsSync(configTs)) {
      return { name: 'playwright.config.ts', status: 'pass', message: 'Found' };
    }
    if (fs.existsSync(configJs)) {
      return { name: 'playwright.config.js', status: 'pass', message: 'Found' };
    }
    return {
      name: 'Playwright Config',
      status: 'fail',
      message: 'playwright.config.ts not found',
      fixHint: 'Run setup_project to generate playwright.config.ts, or create it manually:\n  npx playwright init'
    };
  }

  private checkMcpConfig(projectRoot: string): EnvironmentCheck {
    const configPath = path.join(projectRoot, 'mcp-config.json');
    if (fs.existsSync(configPath)) {
      return { name: 'MCP Config', status: 'pass', message: 'mcp-config.json found' };
    }
    return {
      name: 'MCP Config',
      status: 'warn',
      message: 'mcp-config.json not found',
      fixHint: 'Run setup_project or manage_config to generate it.'
    };
  }

  private checkNodeModules(projectRoot: string): EnvironmentCheck {
    const nodeModules = path.join(projectRoot, 'node_modules');
    if (fs.existsSync(nodeModules)) {
      return { name: 'node_modules', status: 'pass', message: 'Dependencies installed' };
    }
    return {
      name: 'node_modules',
      status: 'fail',
      message: 'node_modules missing — npm install not run',
      fixHint: `Install project dependencies:\n  cd ${projectRoot}\n  npm install`
    };
  }

  private async checkEnvBaseUrl(projectRoot: string): Promise<EnvironmentCheck> {
    const envFile = path.join(projectRoot, '.env');
    if (!fs.existsSync(envFile)) {
      return {
        name: 'BASE_URL',
        status: 'warn',
        message: '.env file not found — BASE_URL unknown',
        fixHint: 'Run manage_env to scaffold a .env file with BASE_URL.'
      };
    }
    const envContent = fs.readFileSync(envFile, 'utf8');
    const match = envContent.match(/^BASE_URL\s*=\s*(.+)$/m);
    if (!match) {
      return {
        name: 'BASE_URL',
        status: 'warn',
        message: 'BASE_URL not set in .env',
        fixHint: 'Add BASE_URL=https://your-app-url to your .env file.'
      };
    }
    const url = (match[1] ?? '').trim();
    return await this.checkBaseUrl(url);
  }

  private checkBaseUrl(url: string): Promise<EnvironmentCheck> {
    return new Promise((resolve) => {
      const proto = url.startsWith('https') ? https : http;
      try {
        const req = proto.get(url, (res) => {
          const ok = res.statusCode !== undefined && res.statusCode < 500;
          resolve({
            name: 'BASE_URL',
            status: ok ? 'pass' : 'warn',
            message: ok
              ? `${url} → HTTP ${res.statusCode}`
              : `${url} → HTTP ${res.statusCode} (non-2xx/3xx)`,
            fixHint: ok ? undefined : 'The app may be returning server errors. Verify the deployment.'
          });
          res.destroy();
        });
        req.on('error', () => {
          resolve({
            name: 'BASE_URL',
            status: 'fail',
            message: `${url} is not reachable`,
            fixHint: 'Verify the web application is running and the URL is correct.\nCheck:\n  - Is the dev server started? (npm run dev)\n  - Is the URL in .env correct?'
          });
        });
        req.setTimeout(5000, () => {
          req.destroy();
          resolve({
            name: 'BASE_URL',
            status: 'fail',
            message: `${url} timed out (5s)`,
            fixHint: 'The server is not responding. Start the app or check the URL.'
          });
        });
      } catch {
        resolve({
          name: 'BASE_URL',
          status: 'fail',
          message: `Invalid URL: ${url}`,
          fixHint: 'Ensure BASE_URL is a valid URL (e.g., https://localhost:3000)'
        });
      }
    });
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
