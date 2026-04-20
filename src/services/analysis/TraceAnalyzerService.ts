import * as fs from 'fs';
import * as path from 'path';
import { ZipExtractor } from '../../utils/ZipExtractor.js';
import { TraceEventParser } from '../../utils/TraceEventParser.js';
import type { TraceReport } from './TraceAnalyzerTypes.js';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Playwright Trace Analyzer (Facade)
 * 
 * Orchestrates trace finding, configuration validation, and analysis
 * by delegating to specialized utilities.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export class TraceAnalyzerService {

  /**
   * Finds the most recent trace.zip in a project's test-results directory.
   */
  public findLatestTrace(projectRoot: string): string | null {
    const testResultsDir = path.join(projectRoot, 'test-results');
    if (!fs.existsSync(testResultsDir)) return null;

    const found: { file: string; mtime: number }[] = [];
    const walk = (dir: string) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.name === 'trace.zip' || entry.name.endsWith('.zip')) {
            const mtime = fs.statSync(fullPath).mtimeMs;
            found.push({ file: fullPath, mtime });
          }
        }
      } catch { /* ignore */ }
    };

    walk(testResultsDir);
    found.sort((a, b) => b.mtime - a.mtime);
    const top = found[0];
    return top !== undefined ? top.file : null;
  }

  /**
   * Checks whether Playwright tracing is correctly configured in playwright.config.ts.
   */
  public checkTraceConfig(projectRoot: string): { configured: boolean; value: string; instruction: string } {
    const configCandidates = [
      path.join(projectRoot, 'playwright.config.ts'),
      path.join(projectRoot, 'playwright.config.js'),
    ];

    let configContent = '';
    let configFile = '';
    for (const candidate of configCandidates) {
      if (fs.existsSync(candidate)) {
        configContent = fs.readFileSync(candidate, 'utf-8');
        configFile = candidate;
        break;
      }
    }

    if (!configContent) {
      return {
        configured: false,
        value: 'absent',
        instruction: `No Playwright config found at ${projectRoot}. Run setup_project first.`
      };
    }

    const traceMatch = configContent.match(/trace\s*:\s*['"]([^'"]+)['"]/);
    const traceValue: string = (traceMatch && traceMatch[1]) ? traceMatch[1] : 'not set';
    const goodValues = ['retain-on-failure', 'on-first-retry', 'on-all-retries', 'always'];

    if (goodValues.includes(traceValue)) {
      return { configured: true, value: traceValue, instruction: '' };
    }

    return {
      configured: false,
      value: traceValue,
      instruction: `Playwright tracing is NOT enabled in ${path.basename(configFile)}.\nSet trace: 'retain-on-failure' in your config.`
    };
  }

  /**
   * Main entry: analyzes a trace.zip and returns a structured report.
   */
  public async analyzeTrace(projectRoot: string, traceFile?: string): Promise<TraceReport> {
    const configStatus = this.checkTraceConfig(projectRoot);
    if (!configStatus.configured) {
      return TraceEventParser.emptyReport(configStatus.instruction);
    }

    const tracePath = traceFile ?? this.findLatestTrace(projectRoot);
    if (!tracePath || !fs.existsSync(tracePath)) {
      return TraceEventParser.emptyReport(`Tracing configured, but no trace.zip found. Traces are only written on failure.`);
    }

    // Delegate extraction to ZipExtractor
    const events = await ZipExtractor.extractTraceEvents(tracePath);
    if (events.length === 0) {
      return TraceEventParser.emptyReport(`Trace found at ${tracePath} but could not parse events.`);
    }

    // Delegate processing to TraceEventParser
    return TraceEventParser.buildReport(tracePath, events);
  }
}
