import type { ICodebaseAnalyzer, CodebaseAnalysisResult } from '../interfaces/ICodebaseAnalyzer.js';
export declare class CodebaseAnalyzerService implements ICodebaseAnalyzer {
    private wrapperCache;
    analyze(projectRoot: string, customWrapperPackage?: string): Promise<CodebaseAnalysisResult>;
    private fileExists;
    private directoryExists;
    private readAllFiles;
    /**
     * Helper that checks array of files to determine naming conventions (PascalCase, kebab-case, snake_case).
     */
    private detectNamingConvention;
    /**
     * Naively extracts top-level keys or structures from JSON/TS/JS data files.
     * Returns a string summarizing the shape (e.g. "{ id, name, details: { ... } }")
     */
    private extractSampleStructure;
}
//# sourceMappingURL=CodebaseAnalyzerService.d.ts.map