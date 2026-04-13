export interface McpConfig {
    /** Version of the project configuration structure (Phase 24) */
    version: string;
    /** Tags the generation prompt enforces. Override to match your team's taxonomy. */
    tags: string[];
    /** Mapping from logical key names to actual .env variable names.
     * @example { baseUrl: 'BASE_URL', apiKey: 'API_KEY' }
     */
    envKeys: {
        baseUrl: string;
        [key: string]: string;
    };
    /** Directory layout for the test project.
     * All paths are relative to projectRoot.
     * @example { features: 'features', pages: 'src/pages', stepDefinitions: 'step-definitions', testData: 'test-data' }
     */
    dirs: {
        features: string;
        pages: string;
        stepDefinitions: string;
        testData: string;
    };
    /** Browsers to include in generated playwright.config.ts.
     * Each entry maps to a Playwright project.
     * @default ['chromium']
     */
    browsers: Array<'chromium' | 'firefox' | 'webkit'>;
    /**
     * Relative path (from projectRoot) to the Playwright config file.
     * When set, this path is passed as `--config <playwrightConfig>` to both
     * `bddgen` and `playwright test`. Leave undefined to use Playwright's
     * default discovery (looks for playwright.config.ts in projectRoot).
     * @example 'playwright.config.ts'
     * @example 'config/playwright.ci.config.ts'
     */
    playwrightConfig?: string;
    /**
     * Relative path (from projectRoot) to the TypeScript config file.
     * When set, passed as `--tsconfig <path>` to every TypeScript compilation step
     * (SandboxEngine, validate_and_write tsc check).
     * Leave undefined to use compiler defaults.
     * @example 'tsconfig.json'
     * @example 'config/tsconfig.test.json'
     */
    tsconfigPath?: string;
    /** Configuration for environment timeouts */
    timeouts: {
        /** Maximum time (in ms) for a single test run shell execution */
        testRun: number;
        /** Maximum time (in ms) to wait for a Playwright session to start or navigate. */
        sessionStart: number;
        /** Max attempts for the validate_and_write self-healing loop. */
        healingMax: number;
    };
    /**
     * How many scenarios must share the same first Given step
     * before a Background: block is auto-generated.
     * @default 3
     */
    backgroundBlockThreshold: number;
    /** Number of retries for test execution */
    retries: number;
    /**
     * @deprecated Use credentials.strategy instead. Kept for backward compatibility.
     * Auth strategy for the project:
     *  - "none"       → no login step generated
     *  - "users-json" → credentials from test-data/users.{env}.json (recommended)
     *  - "env"        → credentials from .env variables (legacy)
     * @default 'users-json'
     */
    authStrategy?: 'none' | 'users-json' | 'env';
    /**
     * Credential storage strategy for this project (AppForge-aligned structure).
     * Controls how test credentials are stored and accessed.
     * If both authStrategy and credentials are set, credentials takes precedence.
     */
    credentials?: {
        /**
         * Storage strategy:
         *  - "none"       → no login step generated
         *  - "users-json" → credentials from test-data/users.{env}.json (recommended)
         *  - "env"        → credentials from .env variables (legacy)
         */
        strategy: 'none' | 'users-json' | 'env';
        /** Optional: Path to the credential file (relative to projectRoot) */
        file?: string;
        /** Optional: For custom strategies, describe the JSON structure for LLM prompts */
        schemaHint?: string;
    };
    /** Currently active environment (matches users.{env}.json).
     * @default 'staging'
     */
    currentEnvironment: string;
    /** All supported environments for this project.
     * @default ['local', 'staging', 'prod']
     */
    environments: string[];
    /**
     * Optional: package name or relative path to a base Page Object class.
     * Injected into generation context so all new POMs extend it.
     * @example '@myorg/test-utils' | 'src/support/BasePage.ts'
     */
    basePageClass?: string;
    /**
     * Load state strategy to use after navigation calls.
     * Defaults to 'networkidle' which works for most SPAs.
     * @default 'domcontentloaded'
     */
    waitStrategy: 'networkidle' | 'domcontentloaded' | 'load';
    /**
     * Path to store/read special architecture notes about custom wrappers or patterns.
     * @default 'docs/mcp-architecture-notes.md'
     */
    architectureNotesPath: string;
    /**
     * Absolute path to the actual automation code.
     * If provided, MCP tools can use this as a fallback projectRoot.
     */
    projectRoot?: string;
    /**
     * Additional folder names or relative paths where test data (JSON/TS/JS) might be stored.
     * Scanned recursively by the codebase analyzer.
     * @default []
     */
    additionalDataPaths: string[];
    /**
     * Accessibility standards to check against.
     * @example ['wcag2aa', 'wcag21aa']
     * @default ['wcag2aa']
     */
    a11yStandards: string[];
    /**
     * Path where accessibility violation reports should be saved.
     * @default 'test-results/a11y-report.json'
     */
    a11yReportPath: string;
    /**
     * Optional custom execution command. If provided, overrides the default test runner command.
     * @example 'npm run test:e2e --'
     * @example 'yarn e2e --'
     */
    executionCommand?: string;
}
export declare const DEFAULT_CONFIG: McpConfig;
/**
 * McpConfigService — Phase 23 + TASK-04 + TASK-12
 *
 * Single source of truth for all team-level preferences.
 * Reads mcp-config.json from the project root and provides typed access.
 *
 * Read contract:
 *  - `read()`    → merged with DEFAULT_CONFIG (all callers get safe defaults)
 *  - `readRaw()` → exactly what is on disk, no defaults injected (for manage_config:read preview)
 *
 * Write contract:
 *  - `write()` → merges patch into disk content, updates `lastWrittenAt` mtime
 *  - `scaffold()` → creates the file if missing; also writes example
 *  - `preview()` → returns merged result WITHOUT touching disk
 */
export declare class McpConfigService {
    private readonly CONFIG_FILE;
    private readonly EXAMPLE_FILE;
    /**
     * Tracks the timestamp of the last explicit `write()` call.
     * Not persisted to disk — in-memory only, scoped to this service instance.
     * Reset on each `write()`; never set by `read()` or `readRaw()`.
     */
    lastWrittenAt: Date | null;
    /**
     * Returns exactly what is in mcp-config.json on disk.
     * Returns `null` if the file does not exist.
     * Does NOT merge with DEFAULT_CONFIG — caller sees the raw partial config.
     */
    readRaw(projectRoot: string): Partial<McpConfig> | null;
    /**
     * Reads mcp-config.json and deep-merges with DEFAULT_CONFIG.
     * Always returns a fully populated McpConfig — never throws on missing file.
     */
    read(projectRoot: string): McpConfig;
    /**
     * Computes what the config would look like after applying `patch`,
     * WITHOUT writing to disk. Use for manage_config:preview.
     */
    preview(projectRoot: string, patch: Partial<McpConfig>): McpConfig;
    /**
     * Deep-merges `patch` into the existing mcp-config.json and writes to disk.
     * `lastWrittenAt` is updated ONLY here — never in read paths.
     */
    write(projectRoot: string, patch: Partial<McpConfig>): McpConfig;
    /**
     * Creates mcp-config.json with defaults if it doesn't exist.
     * Also creates mcp-config.example.json (safe to commit).
     * Returns the config that was written.
     */
    scaffold(projectRoot: string, overrides?: Partial<McpConfig>): McpConfig;
    private deepMerge;
    /**
     * Returns the auth strategy, handling both new (credentials.strategy) and
     * legacy (authStrategy) formats. Credentials takes precedence if both exist.
     */
    getAuthStrategy(config: McpConfig): 'none' | 'users-json' | 'env';
    /**
     * Returns the custom wrapper package name from basePageClass.
     * Used by CodebaseAnalyzerService and UtilAuditService for wrapper introspection.
     */
    getCustomWrapper(config: McpConfig): string | undefined;
}
//# sourceMappingURL=McpConfigService.d.ts.map