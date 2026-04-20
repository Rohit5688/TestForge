import * as fs from 'fs';
import * as path from 'path';
import { EnvUtils } from '../env/EnvUtils.js';
import { PlaywrightEnvChecker } from '../env/PlaywrightEnvChecker.js';
import { ConfigEnvChecker } from '../env/ConfigEnvChecker.js';

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
    const pwCheckObj = PlaywrightEnvChecker.checkPlaywrightInstalled(projectRoot);
    const pwCheck = EnvUtils.toPreFlight(pwCheckObj);
    checks.push(pwCheck);
    if (!pwCheck.passed) return this.buildReport(checks);

    // 2. Configured browsers installed
    const browsersCheckObj = await PlaywrightEnvChecker.checkBrowsersDownloaded(projectRoot);
    const browsersCheck = EnvUtils.toPreFlight(browsersCheckObj, false); // For browsers, let warn mean somewhat passed but warning
    // In original code: if (!browsersCheck.passed) return this.buildReport(checks);
    // warn in original browser check returned passed=false, meaning it blocked.
    // wait, if we look at original:
     // try .. npx playwright install .. return passed: false, severity: warning.
     browsersCheck.passed = (browsersCheckObj.status === 'pass'); 
     if (!browsersCheck.passed) {
       browsersCheck.severity = browsersCheckObj.status === 'warn' ? 'warning' : 'error';
     }
    checks.push(browsersCheck);
    if (!browsersCheck.passed) return this.buildReport(checks);

    // 3. baseUrl reachable
    const resolvedUrl = baseUrl || await this.getEnvBaseUrl(projectRoot);
    if (resolvedUrl) {
      const urlCheckObj = await ConfigEnvChecker.checkBaseUrl(resolvedUrl);
      const urlCheck = EnvUtils.toPreFlight(urlCheckObj);
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
    const configCheckObj = ConfigEnvChecker.checkMcpConfig(projectRoot);
    // original check verifies JSON parsing, while checkMcpConfig only checks file existence.
    // Let's wrap checkMcpConfig for PreFlight to parse as well:
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

  private async getEnvBaseUrl(projectRoot: string): Promise<string | undefined> {
    const localEnv = EnvUtils.loadLocalEnv(projectRoot);
    const url = localEnv['BASE_URL'];
    if (!url || url === '***FILL_IN***') return undefined;
    return url;
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
}
