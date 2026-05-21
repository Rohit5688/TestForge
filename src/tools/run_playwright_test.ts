import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import { TestRunnerService } from "../services/execution/TestRunnerService.js";
import { LastResultStore } from "../services/system/LastResultStore.js";
import { McpConfigService } from "../services/config/McpConfigService.js";
import { buildPackageScriptCommandPlan, buildTrustedCommandPlan } from "../utils/CommandPolicy.js";
import { McpErrors } from "../types/ErrorSystem.js";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

/** Extract failed locators from test output for ripple audit + flakiness tracking. */
function extractFailedLocators(output: string): string[] {
  const locators: string[] = [];
  // Playwright locator patterns: getByRole, getByLabel, getByText, getByTestId, locator(...)
  const pattern = /(?:getBy\w+\([^)]+\)|locator\(['"`][^'"` ]+['"`]\))/g;
  const surrounding = output.slice(0, 8000); // cap scan
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(surrounding)) !== null) {
    if (!locators.includes(m[0])) locators.push(m[0]);
  }
  return locators;
}

/** Extract ERROR DNA failure class from output */
function extractFailureClass(output: string): string | null {
  const match = output.match(/\[ERROR DNA\] class:\s*(\w+)/);
  return match?.[1] ?? null;
}

/** Parse raw Playwright output into structured failure list for direct agent consumption. */
export function parseStructuredFailures(output: string): {
  passed: number; failed: number; skipped: number; noTestsRan: boolean;
  failures: { test: string; file: string; line: number; error: string }[];
} {
  const passedMatch = output.match(/passed:\s*(\d+)/) ?? output.match(/(\d+)\s+passed/) ?? output.match(/PASS\s*\((\d+)\)/);
  const failedMatch = output.match(/failed:\s*(\d+)/) ?? output.match(/(\d+)\s+failed/) ?? output.match(/FAIL\s*\((\d+)\)/);
  const skippedMatch = output.match(/skipped:\s*(\d+)/) ?? output.match(/(\d+)\s+skipped/);
  const passed = passedMatch?.[1] ? parseInt(passedMatch[1]) : 0;
  const failed = failedMatch?.[1] ? parseInt(failedMatch[1]) : 0;
  const skipped = skippedMatch?.[1] ? parseInt(skippedMatch[1]) : 0;
  const noTestsRan = output.includes('NO TESTS RAN') || (
    passed === 0 && failed === 0 && skipped === 0 && output.includes('[TEST SUMMARY]')
  );
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
  return { passed, failed, skipped, noTestsRan, failures };
}

export function formatRunPlaywrightToolOutput(output: string): string {
  const structured = parseStructuredFailures(output);
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

  const compressedOutput = structured.noTestsRan
    ? output
    : structured.failed === 0
      ? `[SUMMARY] ${structured.passed} passed, 0 failed ✅`
      : compressOutput(output);

  // Append structured failure block — agent reads this, skips log parsing
  const failureBlock = (structured.failed > 0 || structured.noTestsRan)
    ? `\n\n[FAILURES]\n${JSON.stringify(structured, null, 2)}`
    : `\n\n[FAILURES] passed=${structured.passed} failed=0`;
  return compressedOutput + failureBlock;
}

export function registerRunPlaywrightTest(server: McpServer, container: ServiceContainer) {
  const runner = container.resolve<TestRunnerService>("runner");
  const configService = container.resolve<McpConfigService>("mcpConfig");
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
        "tags": z.string().optional().describe("Optional: filter by tag(s), e.g. '@smoke' or '@regression'. Passed to bddgen as --tags and to Playwright as --grep."),
        "specificTestArgs": z.string().optional().describe("Optional arguments like a specific feature file path or project flag."),
        "overrideCommand": z.string().optional().describe("Optional package-script command to run (e.g. 'npm run test:e2e:smoke'). Arbitrary shell commands are blocked; project defaults should use mcp-config.json executionCommand."),
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

      if (overrideCommand) {
        buildPackageScriptCommandPlan(projectRoot, overrideCommand);
      }

      // Detached mode: spawn process, return runId immediately — avoids Cline MCP timeout
      if (detached) {
        const runId = randomUUID().slice(0, 8);
        const logDir = path.join(projectRoot, '.TestForge', 'runs');
        fs.mkdirSync(logDir, { recursive: true });
        const logPath = path.join(logDir, `${runId}.log`);
        const donePath = path.join(logDir, `${runId}.done`);
        const pidPath = path.join(logDir, `${runId}.pid`);

        const config = configService.read(projectRoot);
        const commandPlan = overrideCommand
          ? [buildPackageScriptCommandPlan(projectRoot, overrideCommand)]
          : buildTrustedCommandPlan(config.executionCommand || 'npm test');
        if (commandPlan.length !== 1) {
          throw McpErrors.invalidParameter(
            'executionCommand',
            'Detached mode supports one command without shell chaining. Put multi-step flows behind one package script, e.g. "npm run automated-test".',
            'run_playwright_test'
          );
        }
        const command = commandPlan[0]!;
        const logStream = fs.openSync(logPath, 'w');

        const child = spawn(command.exe, command.args, {
          cwd: projectRoot,
          detached: true,
          env: tags ? { ...process.env, TAGS: tags } : process.env,
          stdio: ['ignore', logStream, logStream],
        });
        fs.writeFileSync(pidPath, String(child.pid ?? ''));
        child.unref();

        // Write .done sentinel when process exits
        child.on('close', (code, signal) => {
          fs.closeSync(logStream);
          fs.writeFileSync(donePath, JSON.stringify({
            completedAt: Date.now(),
            exitCode: code,
            signal,
          }, null, 2));
        });

        return textResult(JSON.stringify({
          runId,
          logPath,
          status: 'started',
          message: `Test run started in background. Poll with get_test_run_status({ runId: "${runId}", projectRoot: "${projectRoot}" })`
        }, null, 2));
      }

      const result = await runner.runTests(projectRoot, argsStr, undefined, overrideCommand, { tags });

      // P8: Write result to shared store — self_heal_test auto-reads this
      store.write({
        projectRoot,
        passed: result.passed,
        output: result.output,
        failureClass: extractFailureClass(result.output),
        failedLocators: result.passed ? [] : extractFailedLocators(result.output),
        timestamp: Date.now(),
      });

      return textResult(formatRunPlaywrightToolOutput(result.output));
    }
  );
}
