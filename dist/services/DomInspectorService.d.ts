import type { IDomInspector, LoginMacro } from '../interfaces/IDomInspector.js';
export type DomReturnFormat = 'markdown' | 'json';
export declare class DomInspectorService implements IDomInspector {
    /**
     * Inspect a page's accessibility tree.
     *
     * @param returnFormat  'markdown' (default) — pruned Actionable Markdown for LLM prompts.
     *                      'json' — flat JsonElement[] array (locator + selectorArgs) for
     *                               custom-wrapper-aware POM generators.
     */
    inspect(url: string, waitForSelector?: string, storageState?: string, includeIframes?: boolean, loginMacro?: LoginMacro, timeoutMs?: number, enableVisualMode?: boolean, returnFormat?: DomReturnFormat): Promise<string>;
}
//# sourceMappingURL=DomInspectorService.d.ts.map