import * as fs from 'fs';
import * as path from 'path';
import type { EnvironmentCheck } from './EnvTypes.js';
import type { PreFlightCheck } from '../setup/PreFlightService.js';

export class EnvUtils {
  public static loadLocalEnv(projectRoot: string): Record<string, string> {
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
      } catch {
        // Ignore parsing errors
      }
    }
    return vars;
  }

  // Unified conversion from EnvironmentCheck to PreFlightCheck format
  public static toPreFlight(check: EnvironmentCheck, warnIsFalse = true): PreFlightCheck {
    let passed = false;
    let severity: 'error' | 'warning' | 'info' = 'error';

    if (check.status === 'pass') {
      passed = true;
      severity = 'info';
    } else if (check.status === 'warn') {
      passed = !warnIsFalse;
      severity = 'warning';
    }

    return {
      name: check.name,
      passed,
      message: check.message + (check.fixHint ? `\nHint: ${check.fixHint}` : ''),
      severity
    };
  }
}
