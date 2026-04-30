import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import type { EnvironmentCheck } from './EnvTypes.js';
import { EnvUtils } from './EnvUtils.js';

export class ConfigEnvChecker {
  public static checkPlaywrightConfig(projectRoot: string, customConfigPath?: string): EnvironmentCheck {
    // 1. Check mcp-config.json playwrightConfig field first (custom path)
    if (customConfigPath) {
      const full = path.isAbsolute(customConfigPath)
        ? customConfigPath
        : path.join(projectRoot, customConfigPath);
      if (fs.existsSync(full)) {
        return { name: 'Playwright Config', status: 'pass', message: `Found at ${customConfigPath}` };
      }
      return {
        name: 'Playwright Config',
        status: 'fail',
        message: `playwright config not found at configured path: ${customConfigPath}`,
        fixHint: `Update playwrightConfig in mcp-config.json to the correct relative path.`
      };
    }
    // 2. Default discovery: root-level playwright.config.ts / .js
    const configTs = path.join(projectRoot, 'playwright.config.ts');
    const configJs = path.join(projectRoot, 'playwright.config.js');
    if (fs.existsSync(configTs)) {
      return { name: 'playwright.config.ts', status: 'pass', message: 'Found' };
    }
    if (fs.existsSync(configJs)) {
      return { name: 'playwright.config.js', status: 'pass', message: 'Found' };
    }
    // 3. Scan entire project for any playwright.config.ts (warn, not fail)
    const found = this.findPlaywrightConfig(projectRoot);
    if (found) {
      return {
        name: 'Playwright Config',
        status: 'warn',
        message: `playwright.config.ts found at non-standard path: ${found}`,
        fixHint: `Set playwrightConfig: "${found}" in mcp-config.json so all tools use the correct config.`
      };
    }
    return {
      name: 'Playwright Config',
      status: 'fail',
      message: 'playwright.config.ts not found',
      fixHint: 'Run setup_project to generate playwright.config.ts, or create it manually:\n  npx playwright init'
    };
  }

  private static findPlaywrightConfig(projectRoot: string): string | null {
    const ignore = new Set(['node_modules', '.git', 'dist', 'build', '.TestForge']);
    const search = (dir: string, depth: number): string | null => {
      if (depth > 5) return null;
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory() && !ignore.has(entry.name)) {
            const found = search(path.join(dir, entry.name), depth + 1);
            if (found) return found;
          } else if (entry.isFile() && entry.name === 'playwright.config.ts') {
            return path.relative(projectRoot, path.join(dir, entry.name));
          }
        }
      } catch { /* ignore permission errors */ }
      return null;
    };
    return search(projectRoot, 0);
  }

  public static checkMcpConfig(projectRoot: string): EnvironmentCheck {
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

  public static async checkEnvBaseUrl(projectRoot: string): Promise<EnvironmentCheck> {
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

    let url = (match[1] ?? '').trim();
    if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
      url = url.substring(1, url.length - 1);
    }

    if (url === '***FILL_IN***') {
      return {
        name: 'BASE_URL',
        status: 'warn',
        message: 'BASE_URL not set in .env',
        fixHint: 'replace ***FILL_IN*** with your target url in your .env file.'
      };
    }
    return await this.checkBaseUrl(url);
  }

  public static checkBaseUrl(url: string): Promise<EnvironmentCheck> {
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
}
