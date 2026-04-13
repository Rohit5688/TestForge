import * as fs from 'fs';
import * as path from 'path';
export const DEFAULT_CONFIG = {
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
    CONFIG_FILE = 'mcp-config.json';
    EXAMPLE_FILE = 'mcp-config.example.json';
    /**
     * Tracks the timestamp of the last explicit `write()` call.
     * Not persisted to disk — in-memory only, scoped to this service instance.
     * Reset on each `write()`; never set by `read()` or `readRaw()`.
     */
    lastWrittenAt = null;
    // ---------------------------------------------------------------------------
    // TASK-12: Pure read — returns raw disk content, no defaults injected
    // Use this in manage_config:read so the user sees what they actually stored.
    // ---------------------------------------------------------------------------
    /**
     * Returns exactly what is in mcp-config.json on disk.
     * Returns `null` if the file does not exist.
     * Does NOT merge with DEFAULT_CONFIG — caller sees the raw partial config.
     */
    readRaw(projectRoot) {
        const configPath = path.join(projectRoot, this.CONFIG_FILE);
        if (!fs.existsSync(configPath))
            return null;
        try {
            return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
        catch {
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
    read(projectRoot) {
        const configPath = path.join(projectRoot, this.CONFIG_FILE);
        if (!fs.existsSync(configPath)) {
            return { ...DEFAULT_CONFIG };
        }
        try {
            const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            return this.deepMerge(DEFAULT_CONFIG, raw);
        }
        catch {
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
    preview(projectRoot, patch) {
        const existing = this.read(projectRoot);
        return this.deepMerge(existing, patch);
    }
    // ---------------------------------------------------------------------------
    // Write — merges patch into existing disk content, stamps mtime
    // ---------------------------------------------------------------------------
    /**
     * Deep-merges `patch` into the existing mcp-config.json and writes to disk.
     * `lastWrittenAt` is updated ONLY here — never in read paths.
     */
    write(projectRoot, patch) {
        const existing = this.read(projectRoot);
        const merged = this.deepMerge(existing, patch);
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
    scaffold(projectRoot, overrides = {}) {
        const configPath = path.join(projectRoot, this.CONFIG_FILE);
        const examplePath = path.join(projectRoot, this.EXAMPLE_FILE);
        const config = this.deepMerge(DEFAULT_CONFIG, overrides);
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
    deepMerge(base, override) {
        if (base === null || typeof base !== 'object')
            return override;
        if (override === null || typeof override !== 'object')
            return override;
        if (Array.isArray(base) || Array.isArray(override))
            return override;
        const result = { ...base };
        for (const key of Object.keys(override)) {
            const val = override[key];
            if (val === undefined)
                continue;
            if (typeof val === 'object' && val !== null && !Array.isArray(val) &&
                typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])) {
                result[key] = this.deepMerge(result[key], val);
            }
            else {
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
    getAuthStrategy(config) {
        return config.credentials?.strategy || config.authStrategy || 'users-json';
    }
    /**
     * Returns the custom wrapper package name from basePageClass.
     * Used by CodebaseAnalyzerService and UtilAuditService for wrapper introspection.
     */
    getCustomWrapper(config) {
        return config.basePageClass;
    }
}
//# sourceMappingURL=McpConfigService.js.map