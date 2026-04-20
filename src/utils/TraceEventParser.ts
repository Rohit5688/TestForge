import * as path from 'path';
import type { TraceAction, TraceNetworkCall, TraceReport, SuspiciousGap } from '../services/analysis/TraceAnalyzerTypes.js';

export class TraceEventParser {
  /**
   * Builds the structured TraceReport from parsed events.
   */
  public static buildReport(tracePath: string, events: any[]): TraceReport {
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

    return {
      traceFile: tracePath,
      totalActions: actions.length,
      failedAction,
      actionsNearFailure,
      networkDuringFailure,
      suspiciousGaps,
      hasScreenshotAtFailure,
      summary
    };
  }

  /**
   * Builds a human + LLM readable summary string from the report.
   */
  public static buildSummary(
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

  public static emptyReport(message: string): TraceReport {
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
