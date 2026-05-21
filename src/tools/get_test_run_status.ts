import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import { LastResultStore } from "../services/system/LastResultStore.js";
import { parseStructuredFailures } from "./run_playwright_test.js";
import * as fs from "fs";
import * as path from "path";

export function readDetachedRunCompletion(donePath: string): { completedAt: number | null; exitCode: number | null; signal: string | null } {
  try {
    const raw = fs.readFileSync(donePath, 'utf-8').trim();
    const parsed = JSON.parse(raw);
    return {
      completedAt: typeof parsed.completedAt === 'number' ? parsed.completedAt : null,
      exitCode: typeof parsed.exitCode === 'number' ? parsed.exitCode : null,
      signal: typeof parsed.signal === 'string' ? parsed.signal : null,
    };
  } catch {
    const legacyTimestamp = Number(fs.readFileSync(donePath, 'utf-8').trim());
    return {
      completedAt: Number.isFinite(legacyTimestamp) ? legacyTimestamp : null,
      exitCode: null,
      signal: null,
    };
  }
}

export function summarizeDetachedRunStatus(output: string, exitCode: number | null = null) {
  const structured = parseStructuredFailures(output);
  const noTestsRan = structured.noTestsRan || (
    structured.passed === 0 && structured.failed === 0 && structured.skipped === 0
  );
  const didPass = !noTestsRan && structured.failed === 0 && (exitCode === null || exitCode === 0);
  return {
    status: didPass ? 'passed' : 'failed',
    ...structured,
    noTestsRan,
  };
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
      const completion = readDetachedRunCompletion(donePath);
      const structured = summarizeDetachedRunStatus(output, completion.exitCode);

      store.write({
        projectRoot,
        passed: structured.status === 'passed',
        output: output.slice(0, 8000),
        failureClass: extractFailureClass(output),
        failedLocators: structured.status === 'passed' ? [] : extractFailedLocators(output),
        timestamp: Date.now(),
      });

      // Cleanup pid file
      try { if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath); } catch { /* ignore */ }

      const failureBlock = (structured.failed > 0 || structured.noTestsRan)
        ? `\n[FAILURES]\n${JSON.stringify(structured, null, 2)}`
        : `\n[FAILURES] passed=${structured.passed} failed=0`;

      return textResult(JSON.stringify({
        runId,
        logPath,
        ...completion,
        ...structured,
      }, null, 2) + failureBlock);
    }
  );
}
