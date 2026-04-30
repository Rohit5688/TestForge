import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import { LastResultStore } from "../services/system/LastResultStore.js";
import * as fs from "fs";
import * as path from "path";

/** Parse structured failures from log file content — same logic as run_playwright_test */
function parseStructuredFailures(output: string): {
  passed: number; failed: number;
  failures: { test: string; file: string; line: number; error: string }[];
} {
  const passedMatch = output.match(/(\d+)\s+passed/);
  const failedMatch = output.match(/(\d+)\s+failed/);
  const passed = passedMatch?.[1] ? parseInt(passedMatch[1]) : 0;
  const failed = failedMatch?.[1] ? parseInt(failedMatch[1]) : 0;
  const failures: { test: string; file: string; line: number; error: string }[] = [];
  const testBlockRe = /●\s+(.+?)\n([\s\S]+?)(?=\n\s*●|\n\s*\d+\s+(?:passed|failed)|$)/g;
  let m: RegExpExecArray | null;
  while ((m = testBlockRe.exec(output)) !== null) {
    const testName = (m[1] ?? '').trim();
    const block = m[2] ?? '';
    const errMatch = block.match(/Error:\s*(.+)/);
    const error = errMatch?.[1]
      ? errMatch[1].trim()
      : (block.split('\n').find(l => l.trim())?.trim() ?? 'unknown');
    const fileMatch = block.match(/\(([^)]+\.(?:ts|js|feature)):(\d+)/);
    const rawFile = fileMatch?.[1] ?? '';
    const file = rawFile ? (rawFile.split('/').pop() ?? rawFile) : 'unknown';
    const line = fileMatch?.[2] ? parseInt(fileMatch[2]) : 0;
    failures.push({ test: testName, file, line, error });
    if (failures.length >= 20) break;
  }
  return { passed, failed, failures };
}

function extractFailureClass(output: string): string | null {
  const match = output.match(/\[ERROR DNA\] class:\s*(\w+)/);
  return match?.[1] ?? null;
}

function extractFailedLocators(output: string): string[] {
  const locators: string[] = [];
  const pattern = /(?:getBy\w+\([^)]+\)|locator\(['"`][^'"` ]+['"`]\))/g;
  const surrounding = output.slice(0, 8000);
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(surrounding)) !== null) {
    if (!locators.includes(m[0])) locators.push(m[0]);
  }
  return locators;
}

export function registerGetTestRunStatus(server: McpServer, container: ServiceContainer) {
  const store = LastResultStore.getInstance();

  server.registerTool(
    "get_test_run_status",
    {
      description: `TRIGGER: After run_playwright_test returns a runId (detached mode).
RETURNS: { status: 'running'|'passed'|'failed', passed, failed, failures[], tail } — reads log file written by detached test process.
NEXT: If status='running' → wait and call again | If passed → Done | If failed → Call self_heal_test.
COST: Low (reads log file, no browser, ~100-300 tokens)
ERROR_HANDLING: Returns status='not_found' if runId log file missing.

Polls the log file from a detached run_playwright_test run and returns structured results.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        runId: z.string().describe("The runId returned by run_playwright_test in detached mode."),
        projectRoot: z.string().describe("Absolute path to the automation project."),
        tailLines: z.number().optional().describe("Number of lines to include from log tail (default: 50).")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { runId, projectRoot, tailLines = 50 } = args as any;
      const logDir = path.join(projectRoot, '.TestForge', 'runs');
      const logPath = path.join(logDir, `${runId}.log`);
      const donePath = path.join(logDir, `${runId}.done`);
      const pidPath = path.join(logDir, `${runId}.pid`);

      if (!fs.existsSync(logPath)) {
        return textResult(JSON.stringify({ status: 'not_found', runId, logPath }, null, 2));
      }

      const output = fs.readFileSync(logPath, 'utf-8');
      const isDone = fs.existsSync(donePath);
      const lines = output.split('\n');
      const tail = lines.slice(-tailLines).join('\n');

      if (!isDone) {
        // Still running — return current tail
        return textResult(JSON.stringify({
          status: 'running',
          runId,
          logPath,
          linesWritten: lines.length,
          tail
        }, null, 2));
      }

      // Done — parse results and write to LastResultStore
      const structured = parseStructuredFailures(output);
      const passed = structured.failed === 0;

      store.write({
        projectRoot,
        passed,
        output: output.slice(0, 8000),
        failureClass: extractFailureClass(output),
        failedLocators: passed ? [] : extractFailedLocators(output),
        timestamp: Date.now(),
      });

      // Cleanup pid file
      try { if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath); } catch { /* ignore */ }

      const failureBlock = structured.failed > 0
        ? `\n[FAILURES]\n${JSON.stringify(structured, null, 2)}`
        : `\n[FAILURES] passed=${structured.passed} failed=0`;

      return textResult(JSON.stringify({
        status: passed ? 'passed' : 'failed',
        runId,
        logPath,
        ...structured,
      }, null, 2) + failureBlock);
    }
  );
}