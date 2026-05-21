import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { McpConfigService } from '../config/McpConfigService.js';
import { UserStoreService } from '../config/UserStoreService.js';
import { EnvManagerService } from '../config/EnvManagerService.js';
import { ProjectSetupService } from './ProjectSetupService.js';
import { withRetry, RetryPolicies } from '../../utils/RetryEngine.js';
import { importPlaywright } from '../../utils/PlaywrightRuntime.js';

const execFileAsync = promisify(execFile);

/** Windows package manager shim: npm/npx need .cmd extension for execFile. */
function resolveExe(name: string): string {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

export interface BrowserVerificationResult {
  launchable: boolean;
  message: string;
}

type ExecFileRunner = (
  file: string,
  args: string[],
  options: { cwd: string; timeout: number }
) => Promise<unknown>;

type BrowserLaunchVerifier = () => Promise<BrowserVerificationResult>;

export async function verifyChromiumLaunchable(): Promise<BrowserVerificationResult> {
  let browser: import('playwright').Browser | null = null;
  try {
    const { chromium } = await importPlaywright();
    browser = await chromium.launch({
      headless: true,
      timeout: 30_000,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    return {
      launchable: true,
      message: 'Chromium launched successfully.'
    };
  } catch (error: any) {
    return {
      launchable: false,
      message: error?.message ?? String(error)
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * ProjectMaintenanceService — Phase 24 + Phase 8 Hardening
 *
 * Centralises the logic for upgrading and repairing TestForge projects.
 * - ensureUpToDate(): Auto-called by most tools to keep mcp-config current.
 * - upgradeProject(): Explicit user-triggered upgrade with full dependency update.
 * - repairProject(): Restores missing baseline files without overwriting anything.
 */
export class ProjectMaintenanceService {
  private readonly mcpConfig = new McpConfigService();
  private readonly userStore = new UserStoreService();
  private readonly envManager = new EnvManagerService();
  private readonly setupService = new ProjectSetupService();
  private readonly execFileRunner: ExecFileRunner;
  private readonly browserLaunchVerifier: BrowserLaunchVerifier;

  constructor(deps: {
    execFileRunner?: ExecFileRunner;
    browserLaunchVerifier?: BrowserLaunchVerifier;
  } = {}) {
    this.execFileRunner = deps.execFileRunner ?? execFileAsync;
    this.browserLaunchVerifier = deps.browserLaunchVerifier ?? verifyChromiumLaunchable;
  }

  /**
   * Lightweight, idempotent upgrade — called automatically by every tool.
   * Ensures mcp-config, user stores, and env helpers are current.
   */
  public async ensureUpToDate(projectRoot: string): Promise<string[]> {
    const results: string[] = [];
    const root = path.resolve(projectRoot);

    // 1. Read existing config or scaffold new one
    let cfg = this.mcpConfig.read(root);

    // Record project root if not set
    if (!cfg.projectRoot) {
      cfg.projectRoot = root;
      this.mcpConfig.write(root, { projectRoot: root });
      results.push(`\u2705 projectRoot set to ${root} in mcp-config.json`);
    }

    // 2. Discovery: detect existing env and playwright config
    const rootFiles = fs.readdirSync(root);
    const existingEnv = rootFiles.find((f: string) => f === '.env' || f.startsWith('.env.'));
    const existingPWConfig = rootFiles.find((f: string) => f.startsWith('playwright.config.'));

    if (existingEnv) {
      results.push(`\u2139\ufe0f Existing environment file detected: ${existingEnv}. MCP will reuse it.`);
    } else {
      this.envManager.scaffoldMulti(root, cfg.environments);
      results.push(`\u2705 Environment-specific .env files scaffolded (none found).`);
    }

    if (existingPWConfig) {
      results.push(`\u2139\ufe0f Existing Playwright config detected: ${existingPWConfig}. MCP will respect it.`);
    }

    // 3. Ensure/Upgrade mcp-config.json
    cfg = this.mcpConfig.scaffold(root);
    results.push(`\u2705 MCP Config ensured at v${cfg.version}`);

    // 4. Ensure user stores
    this.userStore.scaffold(root, cfg.environments);
    results.push(`\u2705 User credential stores verified for: ${cfg.environments.join(', ')}`);

    // 5. Regenerate user-helper.ts
    const storeData = this.userStore.read(root, cfg.currentEnvironment);
    const roles = storeData.exists && storeData.roles.length > 0
      ? storeData.roles
      : ['admin', 'standard', 'readonly'];
    this.userStore.generateUserHelper(root, roles);
    results.push(`\u2705 test-data/user-helper.ts regenerated with roles: ${roles.join(', ')}.`);

    return results;
  }

  /**
   * Explicit user-triggered upgrade. Updates deps and verifies baseline.
   */
  public async upgradeProject(projectRoot: string): Promise<string> {
    const logs: string[] = [];
    const root = path.resolve(projectRoot);

    // 1. Auto-maintenance
    const maintenanceLogs = await this.ensureUpToDate(root);
    logs.push(...maintenanceLogs);

    // 1.5 Sync Config Schema
    const schemaLogs = this.setupService.syncConfigSchema(root);
    logs.push(...schemaLogs);

    // 2. Upgrade playwright-bdd to latest.
    // NOTE: Do NOT add @playwright/test to package.json — it is provided implicitly by
    // playwright-bdd. However, standard Playwright APIs (test, expect, etc.) SHOULD
    // be imported directly from '@playwright/test' in the code.
    // Explicitly adding both to package.json can cause duplicate test runner instances.
    try {
      logs.push('Updating playwright-bdd to latest...');
      // TASK-48: execFile instead of exec — prevents && chaining injection.
      // TF-NEW-02: networkCall retry — npm registry is slow in some CI regions.
      await withRetry(
        () => this.execFileRunner(
          resolveExe('npm'), ['install', '--save-dev', 'playwright-bdd@latest'],
          { cwd: root, timeout: 120_000 }
        ),
        RetryPolicies.networkCall
      );
      logs.push('\u2705 playwright-bdd updated to latest (includes @playwright/test as a peer).');
    } catch (err: any) {
      logs.push(`\u274c Failed to update dependencies: ${err.message}`);
    }

    // 3. Install Playwright browsers if needed, then verify the same browser runtime used by MCP tools.
    const browsersDir = path.join(root, 'node_modules', 'playwright', '.local-browsers');
    const skipBrowserInstall = process.env['SKIP_BROWSER_INSTALL'] === '1';
    const installArgs = ['playwright', 'install', 'chromium', 'firefox', '--with-deps'];
    const installCommand = `npx ${installArgs.join(' ')}`;
    let browserCheck: BrowserVerificationResult | null = null;
    let installAttempted = false;
    let installSucceeded = false;

    if (skipBrowserInstall) {
      logs.push('⏭️  Browser install skipped (SKIP_BROWSER_INSTALL=1).');
    } else {
      if (fs.existsSync(browsersDir)) {
        const existingCheck = await this.browserLaunchVerifier();
        if (existingCheck.launchable) {
          browserCheck = existingCheck;
          logs.push(`✅ Playwright browsers already present and launch verified. ${existingCheck.message}`);
        } else {
          logs.push(`ℹ️  Local Playwright browser cache found but launch verification failed. Reinstalling browsers. Details: ${existingCheck.message}`);
        }
      }

      try {
        if (!browserCheck) {
          installAttempted = true;
          // TASK-48: execFile split — avoid injecting shell args through user-controlled paths.
          await withRetry(
            () => this.execFileRunner(
              resolveExe('npx'), installArgs,
              { cwd: root, timeout: 180_000 }
            ),
            RetryPolicies.networkCall
          );
          installSucceeded = true;
        }
      } catch (err: any) {
        logs.push(`⚠️ Browser install warning: ${err.message}`);
        logs.push(`Fix: run this from the project root:\n  ${installCommand}`);
      }
    }

    browserCheck = browserCheck ?? await this.browserLaunchVerifier();
    if (browserCheck.launchable) {
      if (installAttempted && installSucceeded) {
        logs.push(`✅ Playwright browsers installed and launch verified. ${browserCheck.message}`);
      } else if (skipBrowserInstall) {
        logs.push(`✅ Playwright browser launch verified despite skipped install. ${browserCheck.message}`);
      }
    } else {
      logs.push(
        `⚠️ Playwright browser launch verification failed: ${browserCheck.message}\n` +
        `Fix: run this from the project root:\n  ${installCommand}`
      );
    }

    // 4. Verify baseline files (repair any that are missing)
    try {
      logs.push('Verifying baseline project structure...');
      const repairResult = await this.repairProject(root);
      logs.push(repairResult);
    } catch (e: any) {
      logs.push(`\u26a0\ufe0f Could not verify baseline structure: ${e.message}`);
    }

    return logs.join('\n');
  }

  /**
   * Safe to run at any time — only generates files that are missing.
   * Never overwrites existing files.
   */
  public async repairProject(projectRoot: string): Promise<string> {
    return this.setupService.repairProject(projectRoot);
  }
}
