import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { EnvironmentCheck } from './EnvTypes.js';

const execFileAsync = promisify(execFile);

export class NodeEnvChecker {
  public static async checkNode(): Promise<EnvironmentCheck> {
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

  public static checkNodeModules(projectRoot: string): EnvironmentCheck {
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
}
