import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { EnvironmentCheck } from './EnvTypes.js';
import { EnvUtils } from './EnvUtils.js';

const execFileAsync = promisify(execFile);

export class PlaywrightEnvChecker {
  public static checkPlaywrightInstalled(projectRoot: string): EnvironmentCheck {
    const bddPath = path.join(projectRoot, 'node_modules', 'playwright-bdd', 'package.json');
    const pwDirectPath = path.join(projectRoot, 'node_modules', '@playwright', 'test', 'package.json');

    if (fs.existsSync(bddPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(bddPath, 'utf8'));
        const msg = `playwright-bdd v${pkg.version} installed`;

        if (fs.existsSync(pwDirectPath)) {
          const projPkg = path.join(projectRoot, 'package.json');
          if (fs.existsSync(projPkg)) {
            try {
              const projDeps = JSON.parse(fs.readFileSync(projPkg, 'utf8'));
              const directDeps = { ...(projDeps.devDependencies ?? {}), ...(projDeps.dependencies ?? {}) };
              if ('@playwright/test' in directDeps) {
                return {
                  name: 'Playwright Setup',
                  status: 'warn',
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

  public static async checkBrowsersDownloaded(projectRoot: string): Promise<EnvironmentCheck> {
    const localEnv = EnvUtils.loadLocalEnv(projectRoot);
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
}
