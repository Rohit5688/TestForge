import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import type { McpConfigService } from "../services/config/McpConfigService.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Scans all step definition files and returns a flat inventory of existing step patterns.
 * Used to prevent duplicate step definitions before generation.
 */
async function scanStepFiles(projectRoot: string, configuredStepsDir?: string): Promise<{ pattern: string; type: string; file: string }[]> {
  // Priority: mcp-config.json dirs.steps → common conventions (no hardcoded team paths)
  const candidates = configuredStepsDir
    ? [configuredStepsDir]
    : ['step-definitions', 'steps', 'src/steps', 'e2e/steps', 'test/steps'];

  let resolvedDir: string | null = null;
  for (const candidate of candidates) {
    const full = path.isAbsolute(candidate) ? candidate : path.join(projectRoot, candidate);
    try { await fs.access(full); resolvedDir = full; break; } catch { /* try next */ }
  }

  const stepsDir = resolvedDir ?? path.join(projectRoot, 'step-definitions');
  const results: { pattern: string; type: string; file: string }[] = [];
  await scanRecursive(stepsDir, projectRoot, results);
  return results;
}

async function scanRecursive(
  dir: string,
  projectRoot: string,
  results: { pattern: string; type: string; file: string }[]
): Promise<void> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch { return; }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanRecursive(full, projectRoot, results);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      const content = await fs.readFile(full, 'utf8').catch(() => '');
      extractPatterns(content, path.relative(projectRoot, full), results);
    }
  }
}

function extractPatterns(
  content: string,
  relPath: string,
  results: { pattern: string; type: string; file: string }[]
): void {
  // Match Given/When/Then('...') or Given/When/Then(/regex/)
  const stepRegex = /\b(Given|When|Then)\s*\(\s*(['"`])(.*?)\2/g;
  let match: RegExpExecArray | null;
  while ((match = stepRegex.exec(content)) !== null) {
    results.push({ type: match[1]!, pattern: match[3]!, file: relPath });
  }
}

export function registerListExistingSteps(server: McpServer, container: ServiceContainer): void {
  const mcpConfig = container.resolve<McpConfigService>("mcpConfig");
  server.registerTool(
    "list_existing_steps",
    {
      description: `TRIGGER: BEFORE calling generate_gherkin_pom_test_suite. Call this to get the step inventory.
RETURNS: Flat list of { type, pattern, file } for all existing Given/When/Then definitions.
WHY: Prevents duplicate step definition runtime errors — the #1 cause of first-generation failures.
NEXT: Pass the list as context to generate_gherkin_pom_test_suite to avoid conflicts.
COST: Low (file reads only, no browser, ~100-200 tokens)`,
      inputSchema: z.object({
        projectRoot: z.string().describe("Absolute path to the test project root.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot } = args as { projectRoot: string };
      const config = mcpConfig.read(projectRoot);
      const configuredStepsDir = config.dirs?.steps || config.dirs?.stepDefinitions;
      const steps = await scanStepFiles(projectRoot, configuredStepsDir);

      if (steps.length === 0) {
        return textResult(
          `[STEP INVENTORY] No step definitions found.\n` +
          `Searched: ${configuredStepsDir ?? 'step-definitions, steps, src/steps, e2e/steps, test/steps'}\n` +
          `This is a fresh project — generate freely without conflict risk.`
        );
      }

      const byFile: Record<string, { type: string; pattern: string }[]> = {};
      for (const s of steps) {
        if (!byFile[s.file]) byFile[s.file] = [];
        byFile[s.file]!.push({ type: s.type, pattern: s.pattern });
      }

      const lines = [`[STEP INVENTORY] ${steps.length} step(s) across ${Object.keys(byFile).length} file(s)\n`];
      for (const [file, defs] of Object.entries(byFile)) {
        lines.push(`\n${file}:`);
        for (const d of defs) {
          lines.push(`  [${d.type}] "${d.pattern}"`);
        }
      }
      lines.push(`\n⚠️ Do NOT generate steps matching any pattern above — they will cause duplicate definition errors.`);

      const text = lines.join("\n");
      return textResult(text);
    }
  );
}
