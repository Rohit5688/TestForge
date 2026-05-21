import * as fs from 'fs';
import * as path from 'path';
import { McpErrors } from '../types/ErrorSystem.js';
import { ShellSecurityEngine } from './ShellSecurityEngine.js';

export interface CommandSegment {
  exe: string;
  args: string[];
  display: string;
}

function parseJsonFile(filePath: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function readPackageScripts(projectRoot: string): Record<string, string> {
  const pkg = parseJsonFile(path.join(projectRoot, 'package.json'));
  if (!pkg || typeof pkg !== 'object' || !pkg.scripts || typeof pkg.scripts !== 'object') {
    return {};
  }
  return pkg.scripts as Record<string, string>;
}

export function parseCommandLine(command: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of command.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaping) current += '\\';
  if (quote) {
    throw McpErrors.invalidParameter('command', 'Unclosed quote in command string.', 'run_playwright_test');
  }
  if (current) parts.push(current);
  return parts;
}

export function splitCommandSegments(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i]!;

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      current += char;
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) quote = null;
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === '&' && command[i + 1] === '&') {
      const segment = current.trim();
      if (segment) segments.push(segment);
      current = '';
      i++;
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail) segments.push(tail);
  return segments;
}

export function normalizeExecutableForPlatform(exe: string): string {
  if (process.platform === 'win32' && ['npm', 'npx', 'yarn', 'pnpm', 'bun'].includes(exe)) {
    return `${exe}.cmd`;
  }
  return exe;
}

function validateExecutable(exe: string): void {
  if (!exe) throw McpErrors.invalidExecutable(exe);
  if (exe.includes('..') || (exe.includes('/') && !exe.startsWith('/'))) {
    throw McpErrors.invalidExecutable(exe);
  }
}

function toSegment(parts: string[], original: string): CommandSegment {
  let exe = parts[0];
  if (!exe) throw McpErrors.invalidExecutable(original);
  validateExecutable(exe);

  exe = normalizeExecutableForPlatform(exe);
  const args = parts.slice(1);
  const securityCheck = ShellSecurityEngine.validateArgs(args);
  if (!securityCheck.safe) {
    throw McpErrors.shellInjectionDetected(
      `\n⛔ SHELL SECURITY VIOLATION in command segment "${original}":\n` +
      ShellSecurityEngine.formatViolations(securityCheck),
      'run_playwright_test'
    );
  }
  return { exe, args, display: original };
}

export function buildTrustedCommandPlan(command: string): CommandSegment[] {
  return splitCommandSegments(command)
    .map(segment => toSegment(parseCommandLine(segment), segment));
}

function packageScriptNameFor(parts: string[]): string | null {
  const [runner, subcommand, script] = parts;

  if (runner === 'npm') {
    if ((subcommand === 'run' || subcommand === 'run-script') && script) return script;
    if (subcommand === 'test') return 'test';
    return null;
  }

  if (runner === 'pnpm' || runner === 'bun') {
    if (subcommand === 'run' && script) return script;
    if (subcommand === 'test') return 'test';
    return null;
  }

  if (runner === 'yarn') {
    if (subcommand === 'run' && script) return script;
    if (subcommand && !subcommand.startsWith('-')) return subcommand;
    return null;
  }

  return null;
}

export function buildPackageScriptCommandPlan(projectRoot: string, command: string): CommandSegment {
  const segments = splitCommandSegments(command);
  if (segments.length !== 1) {
    throw McpErrors.shellInjectionDetected(
      'overrideCommand must be a single package-script command; shell chaining is not allowed.',
      'run_playwright_test'
    );
  }

  const parts = parseCommandLine(segments[0]!);
  const scriptName = packageScriptNameFor(parts);
  if (!scriptName) {
    throw McpErrors.shellInjectionDetected(
      'overrideCommand must call a package script, for example "npm run custom:e2e".',
      'run_playwright_test'
    );
  }

  const scripts = readPackageScripts(projectRoot);
  if (!Object.prototype.hasOwnProperty.call(scripts, scriptName)) {
    throw McpErrors.invalidParameter(
      'overrideCommand',
      `Package script "${scriptName}" was not found in ${path.join(projectRoot, 'package.json')}.`,
      'run_playwright_test'
    );
  }

  return toSegment(parts, segments[0]!);
}
