import type { ICodebaseAnalyzer, CodebaseAnalysisResult } from '../interfaces/ICodebaseAnalyzer.js';
export declare class CodebaseAnalyzerService implements ICodebaseAnalyzer {
    private wrapperCache;
    analyze(projectRoot: string, customWrapperPackage?: string): Promise<CodebaseAnalysisResult>;
    private fileExists;
    /**
     * BUG-11 FIX: Scans for duplicate @playwright/test installations that cause
     * the 'describe() unexpectedly called' error.
     *
     * PREVIOUS (BROKEN): walked UP the directory tree. In a monorepo this always
     * finds the workspace-root @playwright/test and fires a false-positive warning.
     *
     * FIXED: Scans DOWNWARD — checks depth-2 in node_modules (i.e. a direct
     * dependency that bundled its own @playwright/test copy). This is the only
     * scenario that truly causes loader conflicts, not a shared monorepo install.
     */
    private scanForDuplicatePlaywrightInstallations;
    private directoryExists;
    private readAllFiles;
    /**
     * Helper that checks array of files to determine naming conventions (PascalCase, kebab-case, snake_case).
     */
    private detectNamingConvention;
    private hasClassLocatorsFast;
    /**
     * Enhanced AST-based method extraction for TypeScript classes using ts-morph.
     * Leveraged primarily to resolve custom wrapper packages.
     *
     * For .d.ts files, also uses regex fallback to extract `export declare function` patterns
     * since ts-morph may not capture all declaration file patterns.
     */
    private extractPublicMethods;
    /**
     * Extracts BDD step patterns from file content (Given, When, Then).
     */
    private extractSteps;
    /**
     * Attempts to resolve the custom wrapper package (either local relative path or inside node_modules)
     * and extract explicitly defined public methods from its source (.ts) or typing (.d.ts) files.
     */
    private resolveAndExtractWrapperMethods;
    /**
     * Naively extracts top-level keys or structures from JSON/TS/JS data files.
     * Returns a string summarizing the shape (e.g. "{ id, name, details: { ... } }")
     */
    private extractSampleStructure;
    /**
     * Introspects a custom wrapper package with version-based caching.
     * Cache key = pkg@version, invalidates automatically when package updates.
     * Uses file-based persistence (.TestForge/wrapper-cache.json) to survive server restarts.
     */
    private introspectWrapper;
    /**
     * Load wrapper cache from .TestForge/wrapper-cache.json
     */
    private loadWrapperCacheFromFile;
    /**
     * Save wrapper cache to .TestForge/wrapper-cache.json
     */
    private saveWrapperCacheToFile;
    /**
     * Resolves the on-disk root directory of a package using Node.js module
     * resolution (handles hoisted packages, workspaces, symlinks) with a manual
     * directory-tree walk as fallback.
     *
     * Returns null if the package cannot be found anywhere in the resolution chain.
     */
    private resolvePackageRoot;
    /**
     * Gets the version of a wrapper package for cache invalidation.
     * Returns package.json version for npm packages, file mtime for local files.
     */
    private getWrapperVersion;
    /**
     * Scans a wrapper package (npm or local) and extracts method names.
     */
    private scanWrapper;
    /**
     * Recursively scans a wrapper directory for method names.
     * Depth-limited to avoid performance issues.
     */
    private scanWrapperDir;
}
//# sourceMappingURL=CodebaseAnalyzerService.d.ts.map