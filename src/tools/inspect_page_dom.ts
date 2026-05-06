import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate, validateUrl } from "./_helpers.js";
import type { DomInspectorService } from "../services/dom/DomInspectorService.js";
import { ContextManager } from "../services/system/ContextManager.js";

/**
 * Scans the DOM inspection result string for inputs that only have placeholder-based
 * selectors (no aria-label, no data-testid). Returns a list of human-readable warnings.
 * Prevents the LLM from generating getByLabel() on inputs that have no associated label.
 */
function detectWeakLocators(result: string): string[] {
  const warnings: string[] = [];
  // Match getByPlaceholder entries in both markdown and JSON output formats
  const placeholderMatches = result.matchAll(/getByPlaceholder\(['"]([^'"]+)['"]\)/g);
  for (const match of placeholderMatches) {
    const placeholder = match[1]!;
    // Weak if the surrounding 300 chars have no aria-label or data-testid signals
    const idx = match.index ?? 0;
    const surrounding = result.slice(Math.max(0, idx - 150), idx + 200).toLowerCase();
    const hasLabel = surrounding.includes('aria-label') || surrounding.includes('data-testid') || surrounding.includes('data-test');
    if (!hasLabel) {
      warnings.push(`Input "${placeholder}" — placeholder-only, no aria-label or data-testid`);
    }
  }
  return warnings;
}

/**
 * Scans the JSON element array for ambiguous selectors — multiple elements sharing
 * the same role+name, meaning getByRole(role,{name}) would match >1 element.
 * Returns warnings so the LLM adds index or nth-child disambiguation.
 */
function detectAmbiguousLocators(jsonResult: string): string {
  let elements: Array<{ role?: string; name?: string; selectorArgs?: any }>;
  try { elements = JSON.parse(jsonResult); } catch { return ''; }
  if (!Array.isArray(elements)) return '';

  const counts: Record<string, number> = {};
  for (const el of elements) {
    if (el.role && el.name) {
      const key = `${el.role}::${el.name}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }

  const ambiguous = Object.entries(counts).filter(([, n]) => n > 1);
  if (ambiguous.length === 0) return '';

  const lines = ambiguous.map(([key, n]) => {
    const [role, name] = key.split('::');
    return `  • getByRole('${role}', { name: '${name}' }) — matches ${n} elements, add .nth(i) or a more specific locator`;
  });

  return `\n[LOCATOR CARDINALITY] ${ambiguous.length} ambiguous selector(s) — will throw "strict mode violation" if used directly:\n` +
    lines.join('\n') + '\n';
}


import type { PlaywrightSessionService } from "../services/execution/PlaywrightSessionService.js";
import type { McpConfigService } from "../services/config/McpConfigService.js";

export function registerInspectPageDom(server: McpServer, container: ServiceContainer) {
  const domInspector = container.resolve<DomInspectorService>("domInspector");
  const domInspectionCache = container.resolve<Map<string, string>>("domInspectionCache");
  const contextManager = container.resolve<ContextManager>("contextManager");
  const sessionService = container.resolve<PlaywrightSessionService>("session");
  const mcpConfig = container.resolve<McpConfigService>("mcpConfig");

  server.registerTool(
    "inspect_page_dom",
    {
      description: `TRIGGER: BEFORE generating Page Objects.
RETURNS: Accessibility Tree (semantic DOM) with exact locators — names, roles, test ids + ⚠️ LOCATOR QUALITY WARNINGS for weak inputs.
NEXT: Call generate_gherkin_pom_test_suite with returned locators. TIP: Use returnFormat:'json' — server auto-caches and injects into next generation call.
COST: High (headless browser launch, ~300-1000 tokens)
ERROR_HANDLING: Standard

Navigates to a target URL in a headless browser and returns the Accessibility Tree (semantic DOM).

CRITICAL RULES FOR LLM:
- Always copy element text/name values VERBATIM from this output. NEVER author them from a screenshot — screenshots show rendered visuals (icons, images) that have no text in the DOM tree.
- The locator strings (e.g. page.getByRole(...)) are ready to use. Copy them directly into Page Objects without modification.
- Elements with [coordinate-fallback] have no stable selector — do NOT generate a locator for them. Flag them for manual inspection.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "url": z.string().describe("The full URL to inspect (e.g. http://localhost:3000/login)."),
        "projectRoot": z.string().optional().describe("Optional absolute path to the automation project for loading config timeouts."),
        "waitForSelector": z.string().optional().describe("Optional selector to wait for before parsing, if page is slow to render."),
        "returnFormat": z.enum(["markdown", "json", "yaml"]).optional().describe("Output format. 'yaml' (recommended) — compact locator list, ~60% fewer tokens than markdown. 'json' — flat JsonElement[] with selectorArgs for custom-wrapper POM generation. 'markdown' (default) — full Actionable Markdown."),
        "includeIframes": z.boolean().optional().describe("Set to true to also scrape accessibility trees inside nested iframes."),
        "storageState": z.string().optional().describe("Optional absolute path to a Playwright storageState JSON file to bypass login."),
        "saveStorageState": z.string().optional().describe("Optional absolute path to save session cookies/storage after actionSequence completes. Use this to login once and reuse the session in subsequent calls via storageState."),
        "enableVisualMode": z.boolean().optional().describe("If true, captures a full-page screenshot and includes the file path in output. Use to visually debug what the page looks like after action sequences."),
        "actionSequence": z.array(z.object({
          "action": z.enum(["click", "fill", "wait", "goto", "clickText", "hover", "select", "press", "clearAndFill", "waitForSelector", "evaluate", "waitForResponse", "switchToFrame", "switchToMainFrame", "uploadFile", "switchToNewTab", "switchToTab", "closeTab"]),
          "selector": z.string().optional(),
          "value": z.string().optional(),
          "timeout": z.number().optional(),
          "url": z.string().optional(),
          "frameSelector": z.string().optional()
        })).optional().describe("Optional sequence of actions to execute before parsing the DOM. Ideal for SSO logins or navigating multi-step modals.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async (args) => {
      const { url, projectRoot, waitForSelector, returnFormat, includeIframes, storageState, actionSequence, saveStorageState, enableVisualMode } = args as any;
      // Read enableVisualExploration and domInspection timeout from mcp-config.json if not explicitly passed
      let visualMode = !!enableVisualMode;
      let inspectTimeout = 60000;
      if (projectRoot) {
        try {
          const cfg = mcpConfig.read(projectRoot);
          if (!enableVisualMode) {
            visualMode = !!cfg.enableVisualExploration;
          }
          if (cfg.timeouts?.domInspection) {
            inspectTimeout = cfg.timeouts.domInspection;
          }
        } catch { /* soft fail */ }
      }
      validateUrl(url);
      const format = returnFormat || 'markdown';
      const result = await domInspector.inspect(
        url,
        waitForSelector,
        storageState,
        includeIframes,
        actionSequence,
        inspectTimeout, // timeoutMs — from config or default 60000
        visualMode, // enableVisualMode — from param or mcp-config.json enableVisualExploration
        format as any,
        projectRoot,
        saveStorageState,
        sessionService?.getPage() ?? undefined // reuse active persistent session if available
      );

      // Record successful scan in context manager
      contextManager.recordScan(url, result);

      // B3: Append locator quality warnings so LLM knows which inputs lack stable selectors
      const qualityWarnings = detectWeakLocators(result);
      const qualityBlock = qualityWarnings.length > 0
        ? `\n\n⚠️ LOCATOR QUALITY WARNINGS (${qualityWarnings.length} weak selectors detected):\n` +
          qualityWarnings.map(w => `  • ${w}`).join('\n') +
          `\n  → Use getByPlaceholder() or getLocator('[data-test="..."]') for these inputs.\n  → Do NOT use getByLabel() — these elements have no associated <label> or aria-label.`
        : '';

      if (format === 'json' && projectRoot) {
        domInspectionCache.set(projectRoot, result);
        const cardinalityBlock = detectAmbiguousLocators(result);
        return textResult(`✅ Page DOM inspected and cached in JSON format for project: ${projectRoot}. You can now call generate_gherkin_pom_test_suite without passing domJsonContext.${qualityBlock}${cardinalityBlock}`);
      }

      return textResult(truncate(result) + qualityBlock);
    }
  );
}
