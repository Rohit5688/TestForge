/**
 * Shared types for ContextManager.
 */

export interface DomScanSummary {
  turn: number;
  url: string;
  elementCount: number;
  keySelectors: string[];
  timestamp: string;
}

/** Internal record for tracking POM generation context history */
export interface DomScanRecord {
  turn: number;
  url: string;
  rawSnippet: string;    // First 500 chars of DOM output
  elementCount: number;
  keySelectors: string[];
}
