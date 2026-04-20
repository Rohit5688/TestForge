import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface PreFlightCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface PreFlightReport {
  allPassed: boolean;
  checks: PreFlightCheck[];
  blockers: PreFlightCheck[];
  warnings: PreFlightCheck[];
}

export class PreFlightService {
  private static instance: PreFlightService;
  
  private lastCheckTime = 0;
  private cachedReport: PreFlightReport | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  public static getInstance(): PreFlightService {
    if (!PreFlightService.instance) {
      PreFlightService.instance = new PreFlightService();
    }
    return PreFlightService.instance;
  }

  public async runChecks(projectRoot: string, baseUrl?: string, forceRefresh = false): Promise<PreFlightReport> {
    if (!forceRefresh && this.cachedReport && (Date.now() - this.lastCheckTime) < this.CACHE_TTL_MS) {
      return this.cachedReport;
    }

    const checks: PreFlightCheck[] = [];

    // 1. Playwright installed
    const pwCheck = this.checkPlaywrightInstalled(projectRoot);
    checks.push(pwCheck);
    if (!pwCheck.passed) return this.buildReport(checks);

    // 2. Configured browsers installed
    const browsersCheck = await this.checkBrowsersDownloaded(projectRoot);
    checks.push(browsersCheck);
    if (!browsersCheck.passed) return this.buildReport(checks);

    // 3. baseUrl reachable
    const resolvedUrl = baseUrl || await this.getEnvBaseUrl(projectRoot);
    if (resolvedUrl) {
      const urlCheck = await this.checkBaseUrl(resolvedUrl);
      checks.push(urlCheck);
      if (!urlCheck.passed && urlCheck.severity === 'error') {
        return this.buildReport(checks);
      }
    } else {
      checks.push({
        name: 'BASE_URL',
        passed: false, // Not passed, but warning
        message: 'No BASE_URL provided or found in .env. Skipping reachability check.',
        severity: 'warning'
      });
    }

    // 4. mcp-config.json valid
    const configCheck = this.checkConfigFile(projectRoot);
    checks.push(configCheck);

    const report = this.buildReport(checks);
    if (report.allPassed) {
      this.cachedReport = report;
      this.lastCheckTime = Date.now();
    } else {
      // If checks failed, we shouldn't cache the failure for 5 mins as the user might fix it.
      this.cachedReport = null;
      this.lastCheckTime = 0;
    }
    return report;
  }

  public formatReport(report: PreFlightReport): string {
    const lines: string[] = ['🔍 Pre-Flight Check Results:'];

    for (const check of report.checks) {
      const icon = check.passed ? '✅' : check.severity === 'error' ? '❌' : '⚠️';
      lines.push(`  ${icon} ${check.name}: ${check.message}`);
    }

    if (!report.allPassed && report.blockers.length > 0) {
      lines.push('');
      lines.push('⛔ Blockers found. Fix the issues above before proceeding.');
    }

    return lines.join('\n');
  }

  private checkPlaywrightInstalled(projectRoot: string): PreFlightCheck {
    const bddPath = path.join(projectRoot, 'node_modules', 'playwright-bdd', 'package.json');
    if (fs.existsSync(bddPath)) {
      return {
        name: 'Playwright Installation',
        passed: true,
        message: 'playwright-bdd installed',
        severity: 'info'
      };
    }
    return {
      name: 'Playwright Installation',
      passed: false,
      message: 'playwright-bdd not found in node_modules',
      severity: 'error'
    };
  }

  private async checkBrowsersDownloaded(projectRoot: string): Promise<PreFlightCheck> {
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
        return { 
          name: 'Playwright Browsers', 
          passed: true, 
          message: `${browsers.length} browser(s) downloaded: ${browsers.join(', ')}`,
          severity: 'info'
        };
      }
    }

    try {
      const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      await execFileAsync(npxCmd, ['playwright', '--version'], { cwd: projectRoot });
      return {
        name: 'Playwright Browsers',
        passed: false,
        message: 'Could not verify browser binaries location, but playwright command works.',
        severity: 'warning'
      };
    } catch {
      return {
        name: 'Playwright Browsers',
        passed: false,
        message: 'No browser binaries found. Run npx playwright install',
        severity: 'error'
      };
    }
  }

  private async getEnvBaseUrl(projectRoot: string): Promise<string | undefined> {
    const envFile = path.join(projectRoot, '.env');
    if (!fs.existsSync(envFile)) return undefined;
    const envContent = fs.readFileSync(envFile, 'utf8');
    const match = envContent.match(/^BASE_URL\s*=\s*(.+)$/m);
    if (!match) return undefined;
    const url = (match[1] ?? '').trim();
    if (url === '***FILL_IN***') return undefined;
    return url;
  }

  private checkBaseUrl(url: string): Promise<PreFlightCheck> {
    return new Promise((resolve) => {
      const proto = url.startsWith('https') ? https : http;
      try {
        const req = proto.get(url, (res) => {
          const ok = res.statusCode !== undefined && res.statusCode < 500;
          resolve({
            name: 'BASE_URL reachability',
            passed: ok,
            message: ok ? `${url} is reachable (HTTP ${res.statusCode})` : `${url} returned HTTP ${res.statusCode}`,
            severity: ok ? 'info' : 'warning'
          });
          res.destroy();
        });
        req.on('error', (err) => {
          resolve({
            name: 'BASE_URL reachability',
            passed: false,
            message: `${url} is not reachable: ${err.message}`,
            severity: 'error'
          });
        });
        req.setTimeout(5000, () => {
          req.destroy();
          resolve({
            name: 'BASE_URL reachability',
            passed: false,
            message: `${url} timed out (5s)`,
            severity: 'error'
          });
        });
      } catch (err: any) {
        resolve({
          name: 'BASE_URL reachability',
          passed: false,
          message: `Invalid URL: ${url}`,
          severity: 'error'
        });
      }
    });
  }

  private checkConfigFile(projectRoot: string): PreFlightCheck {
    const configPath = path.join(projectRoot, 'mcp-config.json');
    if (fs.existsSync(configPath)) {
      try {
        JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return { 
          name: 'mcp-config.json', 
          passed: true, 
          message: 'mcp-config.json found and valid', 
          severity: 'info' 
        };
      } catch (e: any) {
        return {
          name: 'mcp-config.json',
          passed: false,
          message: `mcp-config.json is invalid JSON: ${e.message}`,
          severity: 'error'
        };
      }
    }
    return {
      name: 'mcp-config.json',
      passed: false,
      message: 'mcp-config.json not found',
      severity: 'error'
    };
  }

  private buildReport(checks: PreFlightCheck[]): PreFlightReport {
    const blockers = checks.filter(c => !c.passed && c.severity === 'error');
    const warnings = checks.filter(c => !c.passed && c.severity === 'warning');

    return {
      allPassed: blockers.length === 0,
      checks,
      blockers,
      warnings,
    };
  }

  public clearCache(): void {
    this.cachedReport = null;
    this.lastCheckTime = 0;
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
            value = value.replace(/#.*$/, '').trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
              value = value.substring(1, value.length - 1);
            }
            vars[match[1]] = value;
          }
        }
      } catch { }
    }
    return vars;
  }
}
