import * as fs from 'fs';
import * as path from 'path';

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
   * @example 'yarn e2e --'
   */
  executionCommand?: string;

  /**
   * If true, captures full-page screenshots during `inspect_page_dom`
   * and surfaces local paths for visual exploration parity in VSCode/Cline.
   * @default false
   */
  enableVisualExploration: boolean;
}

export const DEFAULT_CONFIG: McpConfig = {
  version: '2.4.0',
  tags: ['@smoke', '@regression', '@e2e', '@a11y'],
  envKeys: { baseUrl: 'BASE_URL' },
  dirs: {
    features: 'features',
    pages: 'pages',
    stepDefinitions: 'step-definitions',
    testData: 'test-data',
  },
  browsers: ['chromium'],
  timeouts: {
    testRun: 120_000,
    sessionStart: 30000,
    healingMax: 3
  },
  retries: 1,
  backgroundBlockThreshold: 3,
  credentials: { strategy: 'users-json' },
  currentEnvironment: 'staging',
  environments: ['local', 'staging', 'prod'],
  waitStrategy: 'domcontentloaded',
  architectureNotesPath: 'docs/mcp-architecture-notes.md',
  additionalDataPaths: [],
  a11yStandards: ['wcag2aa'],
  a11yReportPath: 'test-results/a11y-report.json',
  enableVisualExploration: false,
};

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
export class McpConfigService {
  private readonly CONFIG_FILE = 'mcp-config.json';
  private readonly EXAMPLE_FILE = 'mcp-config.example.json';

  /**
   * Tracks the timestamp of the last explicit `write()` call.
   * Not persisted to disk — in-memory only, scoped to this service instance.
   * Reset on each `write()`; never set by `read()` or `readRaw()`.
   */
  public lastWrittenAt: Date | null = null;

  // ---------------------------------------------------------------------------
  // TASK-12: Pure read — returns raw disk content, no defaults injected
  // Use this in manage_config:read so the user sees what they actually stored.
  // ---------------------------------------------------------------------------

  /**
   * Returns exactly what is in mcp-config.json on disk.
   * Returns `null` if the file does not exist.
   * Does NOT merge with DEFAULT_CONFIG — caller sees the raw partial config.
   */
  public readRaw(projectRoot: string): Partial<McpConfig> | null {
    const configPath = path.join(projectRoot, this.CONFIG_FILE);
    if (!fs.existsSync(configPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Partial<McpConfig>;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Primary read — always returns a fully populated McpConfig (with defaults).
  // All internal callers (test runner, analyzer, generators) must use this.
  // ---------------------------------------------------------------------------

  /**
   * Reads mcp-config.json and deep-merges with DEFAULT_CONFIG.
   * Always returns a fully populated McpConfig — never throws on missing file.
   */
  public read(projectRoot: string): McpConfig {
    const configPath = path.join(projectRoot, this.CONFIG_FILE);
    if (!fs.existsSync(configPath)) {
      return { ...DEFAULT_CONFIG };
    }
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Partial<McpConfig>;
      return this.deepMerge(DEFAULT_CONFIG, raw) as McpConfig;
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  // ---------------------------------------------------------------------------
  // TASK-12: preview — compute the merged result without touching disk
  // ---------------------------------------------------------------------------

  /**
   * Computes what the config would look like after applying `patch`,
   * WITHOUT writing to disk. Use for manage_config:preview.
   */
  public preview(projectRoot: string, patch: Partial<McpConfig>): McpConfig {
    const existing = this.read(projectRoot);
    return this.deepMerge(existing, patch) as McpConfig;
  }

  // ---------------------------------------------------------------------------
  // Write — merges patch into existing disk content, stamps mtime
  // ---------------------------------------------------------------------------

  /**
   * Deep-merges `patch` into the existing mcp-config.json and writes to disk.
   * `lastWrittenAt` is updated ONLY here — never in read paths.
   */
  public write(projectRoot: string, patch: Partial<McpConfig>): McpConfig {
    const existing = this.read(projectRoot);
    const merged = this.deepMerge(existing, patch) as McpConfig;
    const configPath = path.join(projectRoot, this.CONFIG_FILE);
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
    // TASK-12: mtime only updated on explicit write(), never on read()
    this.lastWrittenAt = new Date();
    return merged;
  }

  /**
   * Creates mcp-config.json with defaults if it doesn't exist.
   * Also creates mcp-config.example.json (safe to commit).
   * Returns the config that was written.
   */
  public scaffold(projectRoot: string, overrides: Partial<McpConfig> = {}): McpConfig {
    const configPath = path.join(projectRoot, this.CONFIG_FILE);
    const examplePath = path.join(projectRoot, this.EXAMPLE_FILE);

    const config = this.deepMerge(DEFAULT_CONFIG, overrides) as McpConfig;

    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      this.lastWrittenAt = new Date();
    }

    // Always (re)write the example — it has no secrets
    fs.writeFileSync(examplePath, JSON.stringify(config, null, 2), 'utf-8');

    return config;
  }

  // ---------------------------------------------------------------------------
  // Internal: recursive deep-merge
  // Arrays are replaced (not appended) — this matches config update semantics.
  // ---------------------------------------------------------------------------

  private deepMerge(base: any, override: any): any {
    if (base === null || typeof base !== 'object') return override;
    if (override === null || typeof override !== 'object') return override;
    if (Array.isArray(base) || Array.isArray(override)) return override;

    const result: any = { ...base };
    for (const key of Object.keys(override)) {
      const val = override[key];
      if (val === undefined) continue;

      if (
        typeof val === 'object' && val !== null && !Array.isArray(val) &&
        typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])
      ) {
        result[key] = this.deepMerge(result[key], val);
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Helper methods for backward-compatible access
  // ---------------------------------------------------------------------------

  /**
   * Returns the auth strategy, handling both new (credentials.strategy) and 
   * legacy (authStrategy) formats. Credentials takes precedence if both exist.
   */
  public getAuthStrategy(config: McpConfig): 'none' | 'users-json' | 'env' {
    return config.credentials?.strategy || config.authStrategy || 'users-json';
  }

  /**
   * Returns the custom wrapper package name from basePageClass.
   * Used by CodebaseAnalyzerService and UtilAuditService for wrapper introspection.
   */
  public getCustomWrapper(config: McpConfig): string | undefined {
    return config.basePageClass;
  }
}
