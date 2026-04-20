/**
 * ContextManager — manages DOM scan history and compacts old scans.
 * TASK-67: after 3 DOM scans, compress oldest into single-line summaries.
 * Keep latest 2 full-size. Inject compacted context into generation tool headers.
 *
 * Web-adapted from AppForge ContextManager — uses URL + element count instead of ActionMap.
 */

export interface DomScanSummary {
  turn: number;
  url: string;
  elementCount: number;
  keySelectors: string[];  // Top 3–5 notable selectors/roles
  timestamp: string;
}

interface DomScanRecord {
  turn: number;
  url: string;
  rawSnippet: string;    // First 500 chars of DOM output (for summary extraction)
  elementCount: number;
  keySelectors: string[];
}

export class ContextManager {
  private static instance: ContextManager;

  private scans: DomScanRecord[] = [];

  /** Compact after this many scans */
  private readonly COMPACT_AFTER_SCANS = 3;

  /** Keep this many recent scans full-size */
  private readonly RECENT_SCANS_TO_KEEP = 1;

  private turnCounter = 0;

  public static getInstance(): ContextManager {
    if (!ContextManager.instance) {
      ContextManager.instance = new ContextManager();
    }
    return ContextManager.instance;
  }

  /**
   * Records a DOM scan result.
   * @param url - URL that was inspected
   * @param domOutput - Raw DOM string returned by DomInspectorService
   * @param turn - Conversation turn (optional; auto-increments if not provided)
   */
  public recordScan(url: string, domOutput: string, turn?: number): void {
    const activeTurn = turn ?? ++this.turnCounter;
    const keySelectors = this.extractKeySelectors(domOutput);
    const elementCount = this.countElements(domOutput);
    this.scans.push({
      turn: activeTurn,
      url,
      rawSnippet: domOutput.slice(0, 500),
      elementCount,
      keySelectors,
    });
  }

  /**
   * Returns a compacted history string for injection into generation tool headers.
   * Old scans → 1-line summary. Recent scans → url + count reference.
   */
  public getCompactedHistory(): string {
    if (this.scans.length < this.COMPACT_AFTER_SCANS) {
      return '';
    }

    const sorted = [...this.scans].sort((a, b) => a.turn - b.turn);
    const recentCutoff = sorted.length - this.RECENT_SCANS_TO_KEEP;
    const oldScans = sorted.slice(0, recentCutoff);
    const recentScans = sorted.slice(recentCutoff);

    const lines: string[] = ['[Session DOM History]'];

    for (const scan of oldScans) {
      lines.push(`[Turn ${scan.turn}] ${scan.url} — ${scan.elementCount} elements, key: ${scan.keySelectors.slice(0, 3).join(', ') || 'none'} (compacted)`);
    }

    for (const scan of recentScans) {
      lines.push(`[Turn ${scan.turn}] ${scan.url} — ${scan.elementCount} elements — see latest DOM snapshot`);
    }

    return lines.join('\n');
  }

  /** Returns the URL of the most recently scanned page. */
  public getLatestUrl(): string | null {
    const last = this.scans[this.scans.length - 1];
    return last?.url ?? null;
  }

  /** Returns number of unique URLs visited this session. */
  public getUrlCount(): number {
    return new Set(this.scans.map(s => s.url)).size;
  }

  /** Total scans recorded */
  public getScanCount(): number {
    return this.scans.length;
  }

  /** Resets the context (call on new session start). */
  public reset(): void {
    this.scans = [];
    this.turnCounter = 0;
  }

  /**
   * Purges all compacted history except the most recent scan.
   * Call this after successfully writing a page object to disk — the DOM that generated
   * that page object is no longer needed in future prompts.
   */
  public purgeOldContext(): void {
    if (this.scans.length > 1) {
      this.scans = this.scans.slice(-1);
    }
  }

  /** Simple heuristic: extract quoted selector strings from DOM output. */
  private extractKeySelectors(domOutput: string): string[] {
    const matches = domOutput.match(/role="([^"]+)"|data-testid="([^"]+)"|aria-label="([^"]+)"/g) ?? [];
    return [...new Set(matches)].slice(0, 5);
  }

  /** Heuristic element count: count lines starting with typical DOM node markers. */
  private countElements(domOutput: string): number {
    return (domOutput.match(/^[\s]*[-•*]/gm) ?? []).length || domOutput.split('\n').length;
  }
}
