import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import { TestRunnerService } from "../services/execution/TestRunnerService.js";
import { LastResultStore } from "../services/system/LastResultStore.js";

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
        "overrideCommand": z.string().optional().describe("Optional full command to run (e.g. 'npm run test:e2e:smoke'). This bypasses the default executionCommand.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, tags, specificTestArgs, overrideCommand } = args as any;
      let argsStr = specificTestArgs || '';
      if (tags) {
        argsStr = `--grep ${tags} ${argsStr}`.trim();
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

      // Append structured failure block — agent reads this, skips log parsing
      const structured = parseStructuredFailures(result.output);
      const failureBlock = structured.failed > 0
        ? `\n\n[FAILURES]\n${JSON.stringify(structured, null, 2)}`
        : `\n\n[FAILURES] passed=${structured.passed} failed=0`;
      return textResult(result.output + failureBlock);
    }
  );
}

