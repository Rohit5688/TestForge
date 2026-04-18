import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ─────────────────────────────────────────────────────────────────────────────
// Playwright Trace Analyzer
//
// QA engineers debug flaky tests using Playwright traces — they show:
//   • Exact timing of each action (click, fill, navigate)
//   • Network requests in-flight during assertions
//   • Screenshots at the point of failure
//
// LLMs have zero runtime observability. This service closes that gap by
// parsing trace.zip and returning a structured report that feeds directly
// into the self_heal_test prompt, letting the LLM reason about:
//   • "Was waitForResponse needed before this click?"
//   • "Was this element visible when the click ran?"
//   • "Was the API call still pending when the assertion fired?"
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: All optional fields use `field: type | undefined` (not `field?: type`)
// because exactOptionalPropertyTypes:true disallows assigning `undefined` to `?: type` fields.
interface TraceAction {
  type: string;                    // 'click' | 'fill' | 'navigate' | 'waitForSelector' | etc.
  apiName: string | undefined;     // Playwright API name e.g. 'page.click'
  selector: string | undefined;    // Element targeted
  value: string | undefined;       // Value entered (fill)
  url: string | undefined;         // URL navigated to
  startTime: number;               // ms since trace start
  endTime: number | undefined;     // ms since trace start
  duration: number | undefined;    // ms
  error: string | undefined;       // Error message if action failed
  hasError: boolean;
}

interface TraceNetworkCall {
  url: string;
  method: string;
  status: number | undefined;
  startTime: number;
  endTime: number | undefined;
  duration: number | undefined;
  isXhr: boolean;                  // true for XHR / fetch calls
}

interface TraceReport {
  traceFile: string;
  totalActions: number;
  failedAction: TraceAction | undefined;  // undefined when test passed
  actionsNearFailure: TraceAction[];
  networkDuringFailure: TraceNetworkCall[];
  suspiciousGaps: SuspiciousGap[];
  hasScreenshotAtFailure: boolean;
  summary: string;
}

interface SuspiciousGap {
  afterAction: string;   // Description of action
  beforeAction: string;  // Description of next action
  gapMs: number;         // Time between them
  warning: string;       // Why this is suspicious
}

type ZipEntry = { name: string; compression: number; compressedSize: number; uncompressedSize: number; dataOffset: number };

export class TraceAnalyzerService {

  /**
   * Finds the most recent trace.zip in a project's test-results directory.
   * Playwright writes traces to: test-results/<test-name>/trace.zip
   */
  public findLatestTrace(projectRoot: string): string | null {
    const testResultsDir = path.join(projectRoot, 'test-results');
    if (!fs.existsSync(testResultsDir)) return null;

    // Accumulate into an array to avoid TypeScript's closure-mutation narrowing issue
    // (TS cannot track that `newest` is mutated inside a closure and narrows it to `never`).
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
      } catch { /* ignore permission errors */ }
    };

    walk(testResultsDir);
    found.sort((a, b) => b.mtime - a.mtime);
    const top = found[0];
    return top !== undefined ? top.file : null;
  }

  /**
   * Checks whether Playwright tracing is correctly configured in playwright.config.ts.
   * For new projects this is handled by scaffolding. For existing projects where the
   * user brought their own config, we detect and guide the fix.
   *
   * Recommended value: 'retain-on-failure' (writes trace on first failure, not just retry).
   * Acceptable values: 'on-first-retry', 'on-all-retries', 'always'.
   * Bad values: 'off', missing (default is off).
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
        instruction:
          `No playwright.config.ts found at ${projectRoot}.\n` +
          `Run setup_project first to scaffold the project with tracing enabled.`
      };
    }

    // Match: trace: 'retain-on-failure', trace: "on-first-retry", etc.
    const traceMatch = configContent.match(/trace\s*:\s*['"]([^'"]+)['"]/);
    // Explicit guard: regex group[1] is string|undefined — default to 'not set' for a proper string type
    const traceValue: string = (traceMatch && traceMatch[1]) ? traceMatch[1] : 'not set';
    const goodValues = ['retain-on-failure', 'on-first-retry', 'on-all-retries', 'always'];

    if (goodValues.includes(traceValue)) {
      return { configured: true, value: traceValue, instruction: '' };
    }

    // Not configured or set to 'off'
    const fixLines = [
      `⚠️  Playwright tracing is NOT enabled in ${path.basename(configFile)}.`,
      ``,
      `Current value: trace: '${traceValue}'`,
      ``,
      `Add or update the trace setting in your playwright.config.ts:`,
      ``,
      `  export default defineConfig({`,
      `    use: {`,
      `      trace: 'retain-on-failure',   // ← add this line`,
      `      screenshot: 'only-on-failure',`,
      `      video: 'retain-on-failure',`,
      `    },`,
      `  });`,
      ``,
      `WHY 'retain-on-failure' vs 'on-first-retry':`,
      `  • 'on-first-retry' only writes a trace when the test fails AND a retry is attempted.`,
      `    If retries: 0, you never get a trace. If retries: 1, you need the test to fail twice.`,
      `  • 'retain-on-failure' writes a trace on the FIRST failure, no retry needed.`,
      `    This is what QA engineers need for immediate post-failure debugging.`,
      ``,
      `After adding, run your tests. Traces will appear in test-results/<test-name>/trace.zip.`,
      `Then call analyze_trace again to get the runtime observability report.`,
    ];

    return {
      configured: false,
      value: traceValue,
      instruction: fixLines.join('\n')
    };
  }

  /**
   * Main entry: analyzes the latest (or specified) trace.zip and returns a
   * structured report + actionable LLM prompt section.
   */
  public async analyzeTrace(projectRoot: string, traceFile?: string): Promise<TraceReport> {
    // Step 1: detect if tracing is configured in playwright.config.ts
    const traceConfigStatus = this.checkTraceConfig(projectRoot);
    if (!traceConfigStatus.configured) {
      return this.emptyReport(traceConfigStatus.instruction);
    }

    const tracePath = traceFile ?? this.findLatestTrace(projectRoot);

    if (!tracePath || !fs.existsSync(tracePath)) {
      return this.emptyReport(
        `Tracing IS configured (${traceConfigStatus.value}), but no trace.zip found yet.\n` +
        `Traces are only written when a test FAILS.\n` +
        `Run your tests — if they pass, there is nothing to analyze.\n` +
        `If a test failed and no trace appeared, check that test-results/ is not in .gitignore or deleted by CI cleanup.\n` +
        `Trace will be at: test-results/<test-name>/trace.zip`
      );
    }

    // Extract trace events from zip using Playwright CLI (already installed)
    const events = await this.extractTraceEvents(tracePath);
    if (events.length === 0) {
      return this.emptyReport(`Trace found at ${tracePath} but could not parse events.`);
    }

    return this.buildReport(tracePath, events);
  }

  /**
   * Extracts trace events from trace.zip.
   * Strategy: use Playwright's built-in trace reader via its internal module path,
   * falling back to PowerShell/unzip extraction of the .trace JSON file inside the zip.
   */
  private async extractTraceEvents(tracePath: string): Promise<any[]> {
    try {
      // Strategy 1: Use Node.js to read zip binary + find .trace entry
      // Playwright trace.zip contains files like: trace.trace, resources/, etc.
      // The .trace file is gzip-compressed JSON events, one per line.
      return await this.readTraceFromZip(tracePath);
    } catch (e) {
      // Strategy 2: extract with system tools
      try {
        return await this.extractWithSystemTool(tracePath);
      } catch {
        return [];
      }
    }
  }

  /**
   * Reads the .trace event file from inside a ZIP using raw binary parsing.
   * ZIP format: local file headers at known offsets, findable by scanning for PK signature.
   * We look for the entry named "trace.trace" or ending in ".trace".
   */
  private async readTraceFromZip(zipPath: string): Promise<any[]> {
    const zipBuf = fs.readFileSync(zipPath);

    // Find all local file headers (PK\x03\x04 signature = 0x04034b50)
    const entries = this.findZipEntries(zipBuf);

    // Find the trace events file (.trace extension)
    const traceEntry = entries.find(e =>
      e.name.endsWith('.trace') || e.name === 'trace.trace'
    );

    if (!traceEntry) return [];

    // Extract compressed data
    const compressed = zipBuf.slice(traceEntry.dataOffset, traceEntry.dataOffset + traceEntry.compressedSize);

    let rawText: string;
    if (traceEntry.compression === 0) {
      // Stored (no compression)
      rawText = compressed.toString('utf-8');
    } else if (traceEntry.compression === 8) {
      // Deflate
      rawText = zlib.inflateRawSync(compressed).toString('utf-8');
    } else {
      return [];
    }

    // Parse newline-delimited JSON events
    return rawText
      .split('\n')
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  }

  /**
   * Minimal ZIP local file header parser.
   * Reads the local file directory from the zip binary to find named entries.
   */
  private findZipEntries(buf: Buffer): ZipEntry[] {
    const entries: ZipEntry[] = [];
    let offset = 0;

    while (offset < buf.length - 4) {
      // Local file header signature: PK\x03\x04
      if (buf[offset] === 0x50 && buf[offset + 1] === 0x4b &&
          buf[offset + 2] === 0x03 && buf[offset + 3] === 0x04) {
        const compression    = buf.readUInt16LE(offset + 8);
        const compressedSize = buf.readUInt32LE(offset + 18);
        const nameLength     = buf.readUInt16LE(offset + 26);
        const extraLength    = buf.readUInt16LE(offset + 28);
        const name           = buf.slice(offset + 30, offset + 30 + nameLength).toString('utf-8');
        const dataOffset     = offset + 30 + nameLength + extraLength;
        const uncompressedSize = buf.readUInt32LE(offset + 22);

        entries.push({ name, compression, compressedSize, uncompressedSize, dataOffset });
        offset = dataOffset + compressedSize;
      } else {
        offset++;
      }
    }

    return entries;
  }

  /**
   * Fallback: extract trace events using PowerShell (Windows) or unzip (Linux/Mac).
   */
  private async extractWithSystemTool(zipPath: string): Promise<any[]> {
    const os = process.platform;
    const tempDir = path.join(path.dirname(zipPath), '.trace-extract-tmp');
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      if (os === 'win32') {
        await execFileAsync('powershell', [
          '-Command',
          `Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force`
        ]);
      } else {
        await execFileAsync('unzip', ['-o', zipPath, '-d', tempDir]);
      }

      // Find .trace file in extracted directory
      const traceFile = this.findTraceFile(tempDir);
      if (!traceFile) return [];

      const content = fs.readFileSync(traceFile, 'utf-8');
      return content.split('\n')
        .map(line => { try { return JSON.parse(line); } catch { return null; } })
        .filter(Boolean);
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  private findTraceFile(dir: string): string | null {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.trace')) return fullPath;
      if (entry.isDirectory()) {
        const found = this.findTraceFile(fullPath);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Builds the structured TraceReport from parsed events.
   */
  private buildReport(tracePath: string, events: any[]): TraceReport {
    const traceStartTime = events.find(e => e.startTime)?.startTime ?? 0;

    // Extract actions
    const actions: TraceAction[] = events
      .filter(e => e.type === 'action' || e.type === 'after')
      .map(e => {
        const t0 = (e.startTime ?? traceStartTime) - traceStartTime;
        const t1 = e.endTime ? e.endTime - traceStartTime : undefined;
        const action: TraceAction = {
          type: (e.action ?? e.apiName?.split('.').pop() ?? e.type) as string,
          apiName: e.apiName as string | undefined,
          selector: (e.params?.selector ?? e.selector) as string | undefined,
          value: (e.params?.value ?? e.params?.text) as string | undefined,
          url: e.params?.url as string | undefined,
          startTime: t0,
          endTime: t1,
          duration: t1 !== undefined ? t1 - t0 : undefined,
          error: (e.error?.message ?? e.error?.value) as string | undefined,
          hasError: !!(e.error)
        };
        return action;
      });

    // Extract network requests
    const network: TraceNetworkCall[] = events
      .filter(e => e.type === 'resource-snapshot' || e.type === 'network-request')
      .map(e => {
        const req = e.request ?? e;
        const t0 = (e.timestamp ?? traceStartTime) - traceStartTime;
        const netCall: TraceNetworkCall = {
          url: (req.url ?? '') as string,
          method: (req.method ?? 'GET') as string,
          status: (e.response?.status ?? e.status) as number | undefined,
          startTime: t0,
          endTime: e.responseEndTime ? e.responseEndTime - traceStartTime : undefined,
          duration: e.responseEndTime ? e.responseEndTime - traceStartTime - t0 : undefined,
          isXhr: ((req.url ?? '').includes('/api/') ||
            (e.resourceType === 'xhr') ||
            (e.resourceType === 'fetch')) as boolean
        };
        return netCall;
      })
      .filter(n => n.url && !n.url.startsWith('data:'));

    // Find first failed action
    const failedAction = actions.find(a => a.hasError);
    const failureTime = failedAction?.startTime;

    // Actions near failure (5 before)
    const failIdx = failedAction ? actions.indexOf(failedAction) : actions.length - 1;
    const actionsNearFailure = actions.slice(Math.max(0, failIdx - 5), failIdx + 1);

    // Network calls in-flight at failure time
    const networkDuringFailure = failureTime !== undefined
      ? network.filter(n => n.startTime <= failureTime && (!n.endTime || n.endTime >= failureTime))
      : [];

    // Detect suspicious gaps: consecutive action pairs < 200ms where next is assert/wait
    const suspiciousGaps: SuspiciousGap[] = [];
    for (let i = 0; i < actions.length - 1; i++) {
      const a = actions[i]!;
      const b = actions[i + 1]!;
      const gap = b.startTime - (a.endTime ?? a.startTime);

      // Suspicious: navigation/click followed immediately (< 300ms) by an assertion/check
      const isNavOrClick = ['click', 'navigate', 'goto', 'fill', 'submit'].some(t =>
        a.type.toLowerCase().includes(t));
      const isAssert = ['expect', 'wait', 'assert', 'check', 'should'].some(t =>
        b.type.toLowerCase().includes(t) || (b.apiName ?? '').toLowerCase().includes(t));

      if (isNavOrClick && isAssert && gap < 300) {
        suspiciousGaps.push({
          afterAction: `${a.apiName ?? a.type}${a.selector ? ` (${a.selector})` : ''}`,
          beforeAction: `${b.apiName ?? b.type}${b.selector ? ` (${b.selector})` : ''}`,
          gapMs: gap,
          warning: `Only ${gap}ms between "${a.type}" and "${b.type}". ` +
            `If this triggers a network call or page transition, add waitForResponse() first.`
        });
      }
    }

    const hasScreenshotAtFailure = events.some(e =>
      e.type === 'screencast-frame' &&
      failureTime !== undefined &&
      Math.abs((e.timestamp - traceStartTime) - failureTime) < 2000
    );

    const summary = this.buildSummary(
      tracePath, actions, failedAction, actionsNearFailure,
      networkDuringFailure, suspiciousGaps, hasScreenshotAtFailure
    );

    // Use explicit field assignment — shorthand `failedAction` is `TraceAction | undefined`
    // and exactOptionalPropertyTypes requires we set it explicitly.
    const report: TraceReport = {
      traceFile: tracePath,
      totalActions: actions.length,
      failedAction: failedAction,
      actionsNearFailure: actionsNearFailure,
      networkDuringFailure: networkDuringFailure,
      suspiciousGaps: suspiciousGaps,
      hasScreenshotAtFailure: hasScreenshotAtFailure,
      summary: summary
    };
    return report;
  }

  /**
   * Builds a human + LLM readable summary string from the report.
   * This is what gets injected into the self_heal_test prompt.
   */
  private buildSummary(
    tracePath: string,
    actions: TraceAction[],
    failedAction: TraceAction | undefined,
    nearActions: TraceAction[],
    networkInFlight: TraceNetworkCall[],
    gaps: SuspiciousGap[],
    hasScreenshot: boolean
  ): string {
    const lines: string[] = [
      `═══════════════════════════════════════════════════════`,
      `📊 PLAYWRIGHT TRACE ANALYSIS — Runtime Observability`,
      `   Trace: ${path.basename(path.dirname(tracePath))}`,
      `  Actions: ${actions.length} total`,
      `═══════════════════════════════════════════════════════`,
      ''
    ];

    if (failedAction) {
      lines.push(`❌ FAILED ACTION:`);
      lines.push(`   Type:     ${failedAction.apiName ?? failedAction.type}`);
      if (failedAction.selector) lines.push(`   Target:   ${failedAction.selector}`);
      if (failedAction.duration) lines.push(`   Duration: ${failedAction.duration}ms`);
      lines.push(`   Error:    ${failedAction.error}`);
      lines.push('');
    }

    if (nearActions.length > 0) {
      lines.push(`⏱️  LAST ${nearActions.length} ACTIONS (chronological):`);
      for (const a of nearActions) {
        const indicator = a.hasError ? '❌' : '✅';
        const sel = a.selector ? ` → ${a.selector}` : a.url ? ` → ${a.url}` : '';
        const dur = a.duration !== undefined ? ` (${a.duration}ms)` : '';
        lines.push(`   ${indicator} ${a.apiName ?? a.type}${sel}${dur}`);
      }
      lines.push('');
    }

    if (networkInFlight.length > 0) {
      lines.push(`🌐 NETWORK CALLS IN-FLIGHT AT FAILURE TIME:`);
      lines.push(`   ⚠️  These API calls were still pending when the test failed!`);
      lines.push(`   This is the most common cause of flaky tests on SPAs.`);
      for (const n of networkInFlight.slice(0, 5)) {
        const status = n.status ? ` [${n.status}]` : ' [pending]';
        lines.push(`   • ${n.method} ${n.url.slice(0, 80)}${status}`);
      }
      lines.push('');
      lines.push(`   🔧 FIX: Add before the failing action:`);
      lines.push(`   await page.waitForResponse(resp =>`);
      lines.push(`     resp.url().includes('/api/YOUR_ENDPOINT') && resp.status() === 200`);
      lines.push(`   );`);
      lines.push('');
    }

    if (gaps.length > 0) {
      lines.push(`⚡ SUSPICIOUS TIMING GAPS (potential sync issues):`);
      for (const g of gaps.slice(0, 3)) {
        lines.push(`   • After: "${g.afterAction}"`);
        lines.push(`     Before: "${g.beforeAction}"`);
        lines.push(`     Gap: ${g.gapMs}ms — ${g.warning}`);
        lines.push('');
      }
    }

    if (networkInFlight.length === 0 && gaps.length === 0 && !failedAction) {
      lines.push(`✅ No obvious synchronization issues detected.`);
      lines.push(`   The failure may be environment-specific (resources, browser version).`);
      lines.push('');
    }

    if (hasScreenshot) {
      lines.push(`📸 Screenshot captured at failure point.`);
      lines.push(`   Run: npx playwright show-trace "${tracePath}" to inspect visually.`);
      lines.push('');
    }

    lines.push(`═══════════════════════════════════════════════════════`);
    lines.push(`USE THIS DATA: Reference the network calls and timing gaps above`);
    lines.push(`to add targeted waitForResponse() or expect().toBeVisible() waits`);
    lines.push(`in the generated step definitions. Do NOT add waitForTimeout().`);
    lines.push(`═══════════════════════════════════════════════════════`);

    return lines.join('\n');
  }

  private emptyReport(message: string): TraceReport {
    return {
      traceFile: '',
      totalActions: 0,
      failedAction: undefined,
      actionsNearFailure: [],
      networkDuringFailure: [],
      suspiciousGaps: [],
      hasScreenshotAtFailure: false,
      summary: message
    };
  }
}
