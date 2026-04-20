/**
 * DomHeuristics — utility functions for analyzing DOM snapshots for context summaries.
 */
export class DomHeuristics {
  /**
   * Simple heuristic: extract common interactive attributes from DOM output.
   * Prioritizes roles, test IDs, and labels.
   */
  public static extractKeySelectors(domOutput: string): string[] {
    const matches = domOutput.match(/role="([^"]+)"|data-testid="([^"]+)"|aria-label="([^"]+)"/g) ?? [];
    return [...new Set(matches)].slice(0, 5);
  }

  /**
   * Heuristic element count: counts lines or specific list markers.
   */
  public static countElements(domOutput: string): number {
    return (domOutput.match(/^[\s]*[-•*]/gm) ?? []).length || domOutput.split('\n').length;
  }
}
