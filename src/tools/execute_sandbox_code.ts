import fs from "fs/promises";
import path from "path";
import * as cheerio from "cheerio";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import { McpErrors } from "../types/ErrorSystem.js";
import type { SandboxExecutionService } from "../services/execution/SandboxExecutionService.js";
import { resolveSafePath } from "../services/execution/SandboxExecutionService.js";
import type { CodebaseAnalyzerService } from "../services/analysis/CodebaseAnalyzerService.js";
import type { TraceAnalyzerService } from "../services/analysis/TraceAnalyzerService.js";

export function registerExecuteSandboxCode(server: McpServer, container: ServiceContainer) {
  const sandbox = container.resolve<SandboxExecutionService>("sandbox");
  const analyzer = container.resolve<CodebaseAnalyzerService>("analyzer");
  const traceAnalyzer = container.resolve<TraceAnalyzerService>("traceAnalyzer");

  server.registerTool(
    "execute_sandbox_code",
    {
      description: `TRIGGER: FOR ALL RESEARCH AND ANALYSIS tasks
RETURNS: Filtered sandbox result from forge.api.* calls
NEXT: Use returned data → Proceed to generate or fix
COST: Low (~50-500 tokens depending on script complexity)
ERROR_HANDLING: Returns error message with stack trace on failure

🚀 TURBO MODE — Prefer over analyze_codebase (98% token reduction). APIs: forge.api.readFile(path), readDir(path), findFiles(dir, ext), grep(query, dir), extractPublicMethods(tsCode), parseGherkin(text), parseTrace(tracePath?), parseHtml(html), analyzeCodebase(wrapper?). Use \`return <value>\`. KEEP SCRIPTS STRICTLY READ-ONLY.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().optional().describe("Absolute path to the project to provide context for generic file operations and tool endpoints."),
        "script": z.string().describe("The JavaScript code to execute. Use `return` to send a value back. Use `await forge.api.*()` to call server services. Keep scripts focused and small."),
        "timeoutMs": z.number().optional().describe("Optional execution timeout in milliseconds. Default: 10000 (10s).")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, script, timeoutMs } = args as any;
      if (!projectRoot) {
        throw McpErrors.invalidParameter('projectRoot', 'projectRoot is required; the sandbox security boundary cannot be verified without it.', 'execute_sandbox_code', { suggestedNextTools: ['execute_sandbox_code'] });
      }
      const root = projectRoot;


      const apiRegistry = {
        readFile: async (fileRelPath: string) => {
          const safePath = resolveSafePath(root, fileRelPath);
          return fs.readFile(safePath, 'utf8');
        },
        readDir: async (dirRelPath: string) => {
          const safePath = resolveSafePath(root, dirRelPath);
          return fs.readdir(safePath);
        },
        findFiles: async (dirRelPath: string, extension: string) => {
          const safePath = resolveSafePath(root, dirRelPath);
          const results: string[] = [];
          async function scan(currentDir: string) {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
              if (['node_modules', '.git', 'dist', 'playwright-report'].includes(entry.name)) continue;
              const fullPath = path.join(currentDir, entry.name);
              if (entry.isDirectory()) await scan(fullPath);
              else if (entry.name.endsWith(extension)) results.push(path.relative(root, fullPath).replace(/\\/g, '/'));
            }
          }
          await scan(safePath);
          return results;
        },
        grep: async (query: string, dirRelPath: string = '.') => {
          const safePath = resolveSafePath(root, dirRelPath);
          const results: { file: string; line: number; content: string }[] = [];
          async function scan(currentDir: string) {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
              if (['node_modules', '.git', 'dist', 'playwright-report'].includes(entry.name)) continue;
              const fullPath = path.join(currentDir, entry.name);
              if (entry.isDirectory()) await scan(fullPath);
              else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.feature'))) {
                const content = await fs.readFile(fullPath, 'utf8');
                if (content.includes(query)) {
                  const lines = content.split('\n');
                  lines.forEach((lineStr, idx) => {
                    if (lineStr.includes(query)) results.push({ file: path.relative(root, fullPath), line: idx + 1, content: lineStr.trim() });
                  });
                }
              }
            }
          }
          await scan(safePath);
          return results;
        },
        extractPublicMethods: (tsCode: string) => {
          // Basic regex fallback if ASTScrutinizer is not injected, but we can do a robust regex to mimic
          const methods: string[] = [];
          const matches = tsCode.matchAll(/(?:public\s+|async\s+)?(?:[a-zA-Z0-9_]+)\s*\((.*?)\)\s*(?::\s*[A-Za-z0-9_<>[\]]+)?\s*\{/g);
          for (const match of matches) {
            const full = match[0] as string;
            if (!full.includes('function') && !full.includes('if') && !full.includes('for') && !full.includes('while') && !full.includes('catch')) {
              const namePart = full.split('(')[0];
              if (namePart) {
                methods.push(namePart.trim() + '()');
              }
            }
          }
          return [...new Set(methods)];
        },
        parseGherkin: (text: string) => {
          const lines = text.split('\n');
          const result: { type: string, name: string, steps: string[] }[] = [];
          let current: any = null;
          for (const line of lines) {
            const t = line.trim();
            if (t.startsWith('Feature:')) {
              current = { type: 'Feature', name: t.replace('Feature:', '').trim(), scenarios: [] };
              result.push(current);
            } else if (t.startsWith('Scenario:') || t.startsWith('Scenario Outline:')) {
              current = { type: 'Scenario', name: t.replace(/Scenario( Outline)?:/, '').trim(), steps: [] };
              result.push(current);
            } else if (t.match(/^(Given|When|Then|And|But)\s/)) {
              if (current && current.steps) {
                current.steps.push(t);
              }
            }
          }
          return result;
        },
        analyzeCodebase: async (customWrapper?: string) => {
          return analyzer.analyze(root, customWrapper);
        },
        parseTrace: async (tracePath?: string) => {
          return traceAnalyzer.analyzeTrace(root, tracePath);
        },
        parseHtml: (htmlStr: string) => {

          const $ = cheerio.load(htmlStr);
          // Exposing basic extractors since passing native Cheerio instances across context boundary loses prototype methods.
          return {
            extractText: (selector: string) => $(selector).map((_, el) => $(el).text()).get(),
            extractAttr: (selector: string, attr: string) => $(selector).map((_, el) => $(el).attr(attr)).get(),
            html: () => $.html()
          };
        }
      };

      const result = await sandbox.execute(script, apiRegistry, { timeoutMs, projectRoot: root });
      
      if (!result.success) {
        throw McpErrors.sandboxApiFailed(`Sandbox execution failed: ${result.error}`, undefined, 'execute_sandbox_code');
      }

      return textResult(JSON.stringify(result, null, 2));
    }
  );
}
