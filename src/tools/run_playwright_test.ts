import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import { TestRunnerService } from "../services/execution/TestRunnerService.js";
import { LastResultStore } from "../services/system/LastResultStore.js";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

/**
 * Extract failed locators using the same 5-pattern approach as SelfHealingService:
 *   1. callLog: "- waiting for locator(...)"
 *   2. legacy: "Locator: locator(...)"
 *   3. expectTimeout: "waiting for locator(...) to be visible"
 *   4. strictMode: "locator(...) resolved to N elements"
 *   5. generic getBy* calls in error block
 */
function extractFailedLocators(output: string): string[] {
  const found: string[] = [];
  let m: RegExpExecArray | null;

  const callLog = /[-\u2013]\s*waiting for\s+(locator\([^)]+\)|getBy\w+\([^)]*\))/g;
  while ((m = callLog.exec(output)) !== null) if (m[1] && !found.includes(m[1])) found.push(m[1].trim());

  const legacyLoc = /^\s*Locator:\s+(.+)$/gm;
  while ((m = legacyLoc.exec(output)) !== null) if (m[1] && !found.includes(m[1])) found.push(m[1].trim());

  const expectTimeout = /waiting for\s+(locator\([^)]+\)|getBy\w+\([^)]*\))(?:\s+to\s+\w+)?/g;
  while ((m = expectTimeout.exec(output)) !== null) if (m[1] && !found.includes(m[1])) found.push(m[1].trim());

  const strictMode = /(locator\([^)]+\)|getBy\w+\([^)]*\))\s+resolved to \d+ elements/g;
  while ((m = strictMode.exec(output)) !== null) if (m[1] && !found.includes(m[1])) found.push(m[1].trim());

  const getBy = /\b(getBy(?:Role|Text|Label|Placeholder|AltText|Title|TestId)\([^)]+\))/g;
  while ((m = getBy.exec(output)) !== null) if (m[1] && !found.includes(m[1])) found.push(m[1].trim());

  return found;
}

/** Extract ERROR DNA failure class from output */
function extractFailureClass(output: string): string | null {
  const match = output.match(/\[ERROR DNA\] class:\s*(\w+)/);
  return match?.[1] ?? null;
}

/** Parse raw Playwright output into structured failure list for direct agent consumption. */
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

export function registerRunPlaywrightTest(server: McpServer, container: ServiceContainer) {
  const runner = container.resolve<TestRunnerService>("runner");
  const store = LastResultStore.getInstance();

  server.registerTool(
    "run_playwright_test",
    {
      description: `TRIGGER: After generating or updating tests to verify they pass.
RETURNS: Terminal output + structured [FAILURES] block: { passed, failed, failures[{test, file, line, error}] }. Read [FAILURES] block — skip log parsing.
NEXT: If passed → Done | If failed → Call self_heal_test(errorDna) to fix. NOTE: failure context is auto-stored — self_heal_test will auto-load it if no errorDna is passed.
COST: High (runs full test suite, ~500-5000 tokens depending on output size)
ERROR_HANDLING: Standard

Executes the Playwright-BDD test suite natively.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "tags": z.string().optional().describe("Optional: filter by tag(s), e.g. '@smoke' or '@regression'. Passed as --grep to Playwright."),
        "specificTestArgs": z.string().optional().describe("Optional arguments like a specific feature file path or project flag."),
        "overrideCommand": z.string().optional().describe("Optional full command to run (e.g. 'npm run test:e2e:smoke'). This bypasses the default executionCommand."),
        "detached": z.boolean().optional().describe("If true, spawns the test process in the background and returns a runId immediately. Use get_test_run_status(runId) to poll results. Prevents Cline MCP timeout on long-running suites.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, tags, specificTestArgs, overrideCommand, detached } = args as any;
      let argsStr = specificTestArgs || '';
      if (tags) {
        argsStr = `--grep ${tags} ${argsStr}`.trim();
      }

      // Detached mode: spawn process, return runId immediately — avoids Cline MCP timeout
      if (detached) {
        const runId = randomUUID().slice(0, 8);
        const logDir = path.join(projectRoot, '.TestForge', 'runs');
        fs.mkdirSync(logDir, { recursive: true });
        const logPath = path.join(logDir, `${runId}.log`);
        const donePath = path.join(logDir, `${runId}.done`);
        const pidPath = path.join(logDir, `${runId}.pid`);

        // Build command — same logic as TestRunnerService but as shell string
        const cmd = overrideCommand || 'npm test';
        const logStream = fs.openSync(logPath, 'w');

        // Cross-platform spawn: Windows has no `sh`, use `cmd /c` instead.
        // Tags are injected via the child env, NOT as shell prefix (TAGS=... cmd),
        // which is bash-only and breaks on Windows cmd/powershell.
        const isWin = process.platform === 'win32';
        const [shell, shellFlag] = isWin ? ['cmd.exe', '/c'] : ['sh', '-c'];
        const childEnv = { ...process.env, ...(tags ? { TAGS: tags } : {}) };

        const child = spawn(shell, [shellFlag, cmd], {
          cwd: projectRoot,
          detached: true,
          env: childEnv,
          stdio: ['ignore', logStream, logStream],
        });
        fs.writeFileSync(pidPath, String(child.pid ?? ''));
        child.unref();

        // Write .done sentinel when process exits
        child.on('close', () => {
          fs.closeSync(logStream);
          fs.writeFileSync(donePath, String(Date.now()));
        });

        return textResult(JSON.stringify({
          runId,
          logPath,
          status: 'started',
          message: `Test run started in background. Poll with get_test_run_status({ runId: "${runId}", projectRoot: "${projectRoot}" })`
        }, null, 2));
      }

      const result = await runner.runTests(projectRoot, argsStr, undefined, overrideCommand);

      // P8: Write result to shared store — self_heal_test auto-reads this
      store.write({
        projectRoot,
        passed: result.passed,
        output: result.output,
        failureClass: extractFailureClass(result.output),
        failedLocators: result.passed ? [] : extractFailedLocators(result.output),
        timestamp: Date.now(),
      });

      // Gap-4 fix: Token-efficient output — suppress passing test lines, keep failures + summary.
      // Passing lines contain "✓" or "  ✔" or "    ✓" — compress them to a count.
      const structured = parseStructuredFailures(result.output);
      const compressOutput = (raw: string): string => {
        const lines = raw.split('\n');
        let passCount = 0;
        const kept: string[] = [];
        for (const line of lines) {
          // Passing test lines: start with spaces + ✓/✔/√ or contain " passed"
          if (/^\s+[✓✔√]/.test(line) || /^\s+\d+\) /.test(line) === false && /\bpassed\b/.test(line) && /^\s+/.test(line)) {
            passCount++;
          } else {
            kept.push(line);
          }
        }
        if (passCount > 0) {
          // Insert compact summary at top
          kept.unshift(`[OUTPUT COMPRESSED] ${passCount} passing lines omitted. Only failures and summary shown.`);
        }
        return kept.join('\n');
      };
      const compressedOutput = structured.failed === 0
        ? `[SUMMARY] ${structured.passed} passed, 0 failed ✅`
        : compressOutput(result.output);

      // Append structured failure block — agent reads this, skips log parsing
      const failureBlock = structured.failed > 0
        ? `\n\n[FAILURES]\n${JSON.stringify(structured, null, 2)}`
        : `\n\n[FAILURES] passed=${structured.passed} failed=0`;
      return textResult(compressedOutput + failureBlock);
    }
  );
}

