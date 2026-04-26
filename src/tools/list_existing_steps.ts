import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Scans all step definition files and returns a flat inventory of existing step patterns.
 * Used to prevent duplicate step definitions before generation.
 */
async function scanStepFiles(projectRoot: string): Promise<{ pattern: string; type: string; file: string }[]> {
  const stepsDir = path.join(projectRoot, "step-definitions");
  const results: { pattern: string; type: string; file: string }[] = [];

  let files: string[] = [];
  try {
    files = await fs.readdir(stepsDir);
  } catch {
    // Also try "steps" as alternative directory name
    try {
      const altDir = path.join(projectRoot, "steps");
      files = (await fs.readdir(altDir)).map(f => path.join(altDir, f));
      // Rewrite to use altDir as base
      for (const f of files) {
        const content = await fs.readFile(f, "utf8").catch(() => "");
        extractPatterns(content, path.relative(projectRoot, f), results);
      }
      return results;
    } catch {
      return results; // No step directory found
    }
  }

  for (const fname of files) {
    if (!fname.endsWith(".ts") && !fname.endsWith(".js")) continue;
    const fullPath = path.join(stepsDir, fname);
    const content = await fs.readFile(fullPath, "utf8").catch(() => "");
    extractPatterns(content, path.relative(projectRoot, fullPath), results);
  }
  return results;
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

export function registerListExistingSteps(server: McpServer, _container: ServiceContainer): void {
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
      const steps = await scanStepFiles(projectRoot);

      if (steps.length === 0) {
        return textResult(
          `[STEP INVENTORY] No step definitions found in ${projectRoot}/step-definitions/\n` +
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
