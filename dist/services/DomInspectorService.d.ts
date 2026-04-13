import type { IDomInspector, LoginMacro } from '../interfaces/IDomInspector.js';
export declare class DomInspectorService implements IDomInspector {
    inspect(url: string, waitForSelector?: string, storageState?: string, includeIframes?: boolean, loginMacro?: LoginMacro, timeoutMs?: number, enableVisualMode?: boolean): Promise<string>;
}
//# sourceMappingURL=DomInspectorService.d.ts.map