import { DomHeuristics } from '../../utils/DomHeuristics.js';
import type { DomScanRecord } from './ContextTypes.js';

/**
 * ContextManager — manages DOM scan history and compacts old scans.
 * Keeps latest snapshots full-size while summarizing historical context.
 */
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
   */
  public recordScan(url: string, domOutput: string, turn?: number): void {
    const activeTurn = turn ?? ++this.turnCounter;
    const keySelectors = DomHeuristics.extractKeySelectors(domOutput);
    const elementCount = DomHeuristics.countElements(domOutput);
    
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
   */
  public purgeOldContext(): void {
    if (this.scans.length > 1) {
      this.scans = this.scans.slice(-1);
    }
  }
}
