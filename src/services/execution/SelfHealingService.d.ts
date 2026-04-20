/**
 * SelfHealingService
 *
 * Architecture: The service is purely a "classifier and prompt builder".
 * It does NOT modify any files itself. Instead, it analyses the terminal failure
 * output returned by TestRunnerService, classifies the root-cause, and returns a
 * rich instruction block that lets the Client LLM know EXACTLY what to fix.
 *
 * Classification Strategy:
 *   SCRIPTING_FAILURE  - Locator not found, timeout on element, TypeScript compile error
 *   APPLICATION_FAILURE - Assertion on value mismatch (e.g. wrong text, wrong URL)
 *   UNKNOWN            - Anything else (network, auth, flaky infra)
 */
export type FailureKind = 'SCRIPTING_FAILURE' | 'SYNCHRONIZATION_FAILURE' | 'APPLICATION_FAILURE' | 'UNKNOWN';
export interface HealingAnalysis {
    kind: FailureKind;
    canAutoHeal: boolean;
    failedLocators: string[];
    failedFiles: string[];
    failedLines: string[];
    rawError: string;
    healInstruction: string;
}
export declare class SelfHealingService {
    /** Patterns that strongly indicate a scripting / locator problem (not an app bug). */
    private readonly SCRIPTING_PATTERNS;
    /**
     * Synchronization failures: the locator resolved and the action completed,
     * but the DOM state was read before the UI could reflect the change.
     * Classic causes: rich text editor iframes, debounced state updates, React re-renders.
     */
    private readonly SYNC_PATTERNS;
    /** Patterns that indicate the app returned unexpected data (not a locator guess). */
    private readonly APP_FAILURE_PATTERNS;
    analyzeFailure(testOutput: string): HealingAnalysis;
    private classifyFailure;
    private extractFailedLocators;
    private extractFailedFiles;
    private extractFailedLines;
    private buildHealInstruction;
}
//# sourceMappingURL=SelfHealingService.d.ts.map