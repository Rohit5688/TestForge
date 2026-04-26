import { McpErrors, McpError, McpErrorCode } from '../../types/ErrorSystem.js';
/**
 * SandboxEngine.ts — Secure V8-Isolated Code Execution for Token Optimization
 *
 * STRATEGY: Instead of the LLM calling 20+ MCP tools (each costing thousands of
 * input/output tokens for schemas and payloads), it writes a small JS script that
 * runs inside a secure sandbox on the MCP server. The script calls server services
 * directly through a thin "forge" API, processes the data locally, and returns
 * ONLY the final result (e.g., a locator string instead of 10,000 lines of DOM).
 *
 * SAFETY: Uses Node's built-in `vm` module with strict contextification.
 * - No access to `require`, `process`, `fs`, `fetch`, `eval`, or `Function`.
 * - Strict timeout enforcement (default 10s).
 * - Fresh context per execution (no state leakage between runs).
 *
 * ZERO BREAKING CHANGES: This is a purely additive feature. All existing tools
 * remain untouched and fully functional. This adds ONE new tool alongside them.
 */

import * as vm from 'node:vm';
import * as path from 'node:path';

/**
 * Defines the shape of a service method that can be exposed to the sandbox.
 * Each method receives a single JSON-serializable argument and returns a
 * JSON-serializable result (or a Promise of one).
 */
export type SandboxApiMethod = (...args: any[]) => any | Promise<any>;

/**
 * The registry of methods exposed to the sandbox script via `forge.api.*`.
 */
export interface SandboxApiRegistry {
  [methodName: string]: SandboxApiMethod;
}

/**
 * Configuration options for the sandbox execution.
 */
export interface SandboxOptions {
  /** Max execution time in milliseconds. Default: 10000 (10s). */
  timeoutMs?: number;
  /** Maximum memory in MB (advisory — Node vm doesn\'t enforce hard limits). */
  maxMemoryMb?: number;
  /**
   * If provided, all `forge.api.readFile`-style paths will be validated to
   * ensure they resolve within this root. Prevents sandbox scripts from
   * reaching outside the project directory.
   */
  projectRoot?: string;
}

/**
 * The result returned after executing a sandbox script.
 */
export interface SandboxResult {
  /** Whether the script executed successfully. */
  success: boolean;
  /** The return value of the script (JSON-serializable). */
  result?: any;
  /** Error message if execution failed. */
  error?: string;
  /** Execution duration in milliseconds. */
  durationMs: number;
  /** Console output captured from the sandbox. */
  logs: string[];
}

// ─── Path guard ───────────────────────────────────────────────────────────────

/**
 * Validates that a file path resolves within the given project root.
 * Used by sandbox API methods that accept caller-supplied file paths.
 *
 * @param projectRoot Absolute path to the project root.
 * @param filePath    Caller-supplied (possibly relative) file path.
 * @returns           The resolved absolute path.
 * @throws            Error if the resolved path escapes the project root.
 */
export function resolveSafePath(projectRoot: string, filePath: string): string {
  const normalizedRoot = path.resolve(projectRoot);
  const resolvedPath = path.resolve(normalizedRoot, filePath);

  if (
    !resolvedPath.startsWith(normalizedRoot + path.sep) &&
    resolvedPath !== normalizedRoot
  ) {
    throw McpErrors.permissionDenied(
      resolvedPath,
      `SANDBOX PATH SECURITY: "${filePath}" resolves to "${resolvedPath}" ` +
      `which is outside the project root "${normalizedRoot}". Path traversal blocked.`
    );
  }

  return resolvedPath;
}

// ─── Blocked patterns for static code validation ──────────────────────────────
const BLOCKED_PATTERNS = [
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\brequire\s*\(/,
  /\bimport\s*\(/,
  /\bprocess\b/,
  /\b__dirname\b/,
  /\b__filename\b/,
  /\bglobal\b/,
  /\bglobalThis\b/,
  /\bchild_process\b/,
  /\bworker_threads\b/,
  /\.constructor\s*\.\s*constructor/i,
  /this\s*\.\s*constructor\s*\.\s*constructor/i,
  /Object\s*\.\s*getPrototypeOf/,          // blocks prototype chain escape via AsyncFunction (AUDIT-07)
  /Object\s*\.\s*getOwnPropertyDescriptor/, // blocks property descriptor access on host objects (AUDIT-07)
  /\bReflect\b/,                           // blocks using Reflect (AUDIT-07)
  /\bFunction\b/,                          // blocks using Function (AUDIT-07)
];

/**
 * Validates a script for dangerous patterns before execution.
 * This is a defense-in-depth measure (the sandbox context already blocks these).
 */
function validateScript(script: string): string | null {
  const ACTIONABLE_HINTS: Array<{ pattern: RegExp; hint: string }> = [
    {
      pattern: /\brequire\s*\(/,
      hint: `DO NOT use require(). The sandbox has no module system.\n` +
            `  → To read a file: await forge.api.readFile('absolute/path/to/file')\n` +
            `  → To inspect a package API: await forge.api.readFile('node_modules/pkg/dist/index.d.ts')\n` +
            `  → To launch a browser: use gather_test_context or inspect_page_dom tools instead`
    },
    {
      pattern: /\bimport\s*\(/,
      hint: `DO NOT use dynamic import(). Use forge.api.readFile() for file reads.`
    },
    {
      pattern: /\beval\s*\(/,
      hint: `DO NOT use eval(). Write the logic directly in the script.`
    },
    {
      pattern: /\bnew\s+Function\s*\(/,
      hint: `DO NOT use new Function(). Write the logic directly in the script.`
    },
    {
      pattern: /\bprocess\b/,
      hint: `DO NOT use process. Use forge.api.readFile() for config/env files.`
    },
  ];

  for (const { pattern, hint } of ACTIONABLE_HINTS) {
    if (pattern.test(script)) {
      return `[SANDBOX BLOCKED] Script uses a forbidden Node.js pattern.\n\n${hint}\n\n` +
        `Available sandbox APIs: forge.api.readFile(path), forge.api.readDir(path), ` +
        `forge.api.findFiles(dir, ext), forge.api.grep(query, dir), ` +
        `forge.api.extractPublicMethods(tsCode), forge.api.parseGherkin(text)`;
    }
  }

  // Check remaining blocked patterns without specific hints
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(script)) {
      return `[SANDBOX BLOCKED] Script contains forbidden pattern "${pattern.source}". ` +
        `Sandbox is READ-ONLY analysis only. Use forge.api.* methods for all file and code operations.`;
    }
  }

  return null; // Script is clean
}

/**
 * Creates a minimal safe console that captures output without exposing internals.
 */
function createSafeConsole(logs: string[]) {
  return Object.freeze({
    log: (...args: any[]) => logs.push(args.map(String).join(' ')),
    warn: (...args: any[]) => logs.push(`[WARN] ${args.map(String).join(' ')}`),
    error: (...args: any[]) => logs.push(`[ERROR] ${args.map(String).join(' ')}`),
    info: (...args: any[]) => logs.push(`[INFO] ${args.map(String).join(' ')}`),
    debug: (...args: any[]) => logs.push(`[DEBUG] ${args.map(String).join(' ')}`),
  });
}

/**
 * Executes a user-provided script inside a secure, isolated V8 context.
 *
 * The script has access to:
 * - `forge.api.<methodName>(args)` — Calls registered server-side services.
 * - `console.log(...)` — Captured and returned in `SandboxResult.logs`.
 * - Standard JS builtins: JSON, Math, Array, Object, String, Date, Map, Set, etc.
 *
 * The script does NOT have access to:
 * - require, import, process, fs, fetch, eval, Function constructor, or any Node.js globals.
 *
 * @param script The JavaScript code to execute.
 * @param apiRegistry The server-side methods to expose as `forge.api.*`.
 * @param options Execution options (timeout, memory).
 * @returns A `SandboxResult` with the return value, logs, and timing.
 */
export async function executeSandbox(
  script: string,
  apiRegistry: SandboxApiRegistry,
  options: SandboxOptions = {}
): Promise<SandboxResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const startTime = Date.now();
  const logs: string[] = [];

  // Step 1: Static code validation (defense-in-depth)
  const validationError = validateScript(script);
  if (validationError) {
    return {
      success: false,
      error: validationError,
      durationMs: Date.now() - startTime,
      logs: [],
    };
  }

  // Step 2: Build the API bridge.
  // The sandbox can call `forge.api.someMethod(args)` which invokes the
  // registered server-side function. We wrap each method in a Promise-returning
  // function so the sandbox can `await` it.
  const apiBridge: Record<string, (...args: any[]) => Promise<any>> = {};
  for (const [name, fn] of Object.entries(apiRegistry)) {
    apiBridge[name] = async (...args: any[]) => {
      try {
        return await fn(...args);
      } catch (err) {
        throw McpErrors.sandboxApiFailed(`forge.api.${name}() failed`, err as Error);
      }
    };
  }

  // Freeze the API bridge to prevent modification
  Object.freeze(apiBridge);

  // Step 3: Create a sandboxed context with only safe globals.
  // CRITICAL: We explicitly set dangerous globals to undefined or null to block access.
  const sandboxGlobals: Record<string, any> = {
    // The forge SDK — the only way the script can interact with the server
    forge: Object.freeze({
      api: apiBridge,
    }),

    // Safe console (captured, not printed)
    console: createSafeConsole(logs),

    // Standard safe builtins
    // TASK-09: Freeze mutable constructors to prevent prototype pollution.
    // A sandbox script that can mutate Array.prototype or Object.prototype
    // could corrupt host-side data structures accessed through the API bridge.
    JSON: Object.freeze(JSON),
    Math: Object.freeze(Math),
    Date: Object.freeze(Date),
    Array: Object.freeze(Array),
    Object: Object.freeze(Object),
    String: Object.freeze(String),
    Number: Object.freeze(Number),
    Boolean: Object.freeze(Boolean),
    Map: Object.freeze(Map),
    Set: Object.freeze(Set),
    WeakMap: Object.freeze(WeakMap),
    WeakSet: Object.freeze(WeakSet),
    RegExp: Object.freeze(RegExp),
    Error: Object.freeze(Error),
    TypeError: Object.freeze(TypeError),
    RangeError: Object.freeze(RangeError),
    SyntaxError: Object.freeze(SyntaxError),
    ReferenceError: Object.freeze(ReferenceError),
    EvalError: Object.freeze(EvalError),
    URIError: Object.freeze(URIError),
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    Promise: class SandboxPromise<T> extends Promise<T> { },

    // === SECURITY: Explicitly block all dangerous globals ===
    // Setting to undefined ensures they cannot be accessed, even via prototype chains
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    clearTimeout: undefined,
    clearInterval: undefined,
    clearImmediate: undefined,
    fetch: undefined,
    require: undefined,
    module: undefined,
    exports: undefined,
    __dirname: undefined,
    __filename: undefined,
    global: undefined,
    globalThis: undefined,
    process: undefined,
    Buffer: undefined,

    // Block constructor-based escapes
    // Note: this.constructor.constructor is checked in static validation
    Function: undefined,
    eval: undefined,

    // Block async resource access
    queueMicrotask: undefined,
  };

  const context = vm.createContext(sandboxGlobals, {
    name: 'ForgeCodeModeSandbox',
    codeGeneration: {
      strings: false,   // Block eval() and new Function()
      wasm: false,       // Block WebAssembly compilation
    },
  });

  // Step 4: Wrap the user script in an async IIFE so they can use `await`.
  // We also wrap in try-catch to capture any unhandled errors gracefully.
  const wrappedScript = `
    (async () => {
      'use strict';
      ${script}
    })();
  `;

  try {
    const vmScript = new vm.Script(wrappedScript, {
      filename: 'forge-sandbox.js',
    });

    const resultPromise = vmScript.runInContext(context, {
      timeout: timeoutMs,
      displayErrors: true,
    });

    // The wrapped script returns a Promise (from the async IIFE).
    const result = await resultPromise;

    // Guard: coalesce undefined → null so JSON.stringify always produces valid JSON.
    // A script with no `return` yields undefined, which JSON.stringify converts to
    // the JS value undefined (not the string "null"), causing "undefined" to appear
    // in concatenated output — the root cause of the "sandbox returned no output" bug.
    const safeResult = result === undefined ? null : result;

    if (safeResult === null && logs.length === 0) {
      logs.push('[sandbox] Script completed but returned no value. Add a `return` statement to send data back.');
    }

    return {
      success: true,
      result: safeResult,
      durationMs: Date.now() - startTime,
      logs,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.toString() : String(err);
    return {
      success: false,
      error: errorMessage,
      durationMs: Date.now() - startTime,
      logs,
    };
  }
}

// ─── Service class (DI-friendly wrapper) ─────────────────────────────────────

/**
 * Service-container-friendly wrapper around the `executeSandbox` function.
 * Registered as "sandbox" in ServiceContainer.ts.
 */
export class SandboxExecutionService {
  execute(
    script: string,
    apiRegistry: SandboxApiRegistry = {},
    options: SandboxOptions = {}
  ): Promise<SandboxResult> {
    return executeSandbox(script, apiRegistry, options);
  }
}
