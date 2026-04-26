/**
 * LastResultStore — in-memory cross-tool state bridge.
 *
 * Written by: run_playwright_test, run_cucumber_test
 * Read by: self_heal_test (auto-inject when no errorDna supplied)
 *
 * Design: singleton, keyed by projectRoot. Zero persistence — session-scoped only.
 * LLM benefit: eliminates manual copy-paste of failure output between tools.
 */
export interface LastRunResult {
  projectRoot: string;
  passed: boolean;
  output: string;
  failureClass: string | null;   // from [ERROR DNA] classification
  failedLocators: string[];      // extracted selector strings for ripple audit
  timestamp: number;
}

export class LastResultStore {
  private static instance: LastResultStore;
  private readonly store = new Map<string, LastRunResult>();

  public static getInstance(): LastResultStore {
    if (!LastResultStore.instance) {
      LastResultStore.instance = new LastResultStore();
    }
    return LastResultStore.instance;
  }

  /** Called by run_playwright_test after each run. */
  public write(result: LastRunResult): void {
    this.store.set(result.projectRoot, result);
  }

  /** Called by self_heal_test if no errorDna is manually supplied. */
  public read(projectRoot: string): LastRunResult | undefined {
    return this.store.get(projectRoot);
  }

  /** Clears the entry — call on session reset. */
  public clear(projectRoot: string): void {
    this.store.delete(projectRoot);
  }

  /** Returns age in seconds since last run for a project. */
  public ageSeconds(projectRoot: string): number | null {
    const r = this.store.get(projectRoot);
    if (!r) return null;
    return Math.round((Date.now() - r.timestamp) / 1000);
  }
}
