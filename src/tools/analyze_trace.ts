import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { TraceAnalyzerService } from "../services/analysis/TraceAnalyzerService.js";

export function registerAnalyzeTrace(server: McpServer, container: ServiceContainer) {
  const traceAnalyzer = container.resolve<TraceAnalyzerService>("traceAnalyzer");

  server.registerTool(
    "analyze_trace",
    {
      description: `TRIGGER: After a test fails OR when a test is flaky.
RETURNS: Runtime observability data — actions that were too fast, API calls in-flight during assertions, where to add waitForResponse().
NEXT: Review pending XHR/action timing → Update step definitions with waitForResponse() or state assertions.
COST: Medium (reads trace.zip, ~200-400 tokens)
ERROR_HANDLING: Standard

Reads the Playwright trace.zip from test-results/ and returns runtime observability data. WHY: LLMs have no runtime visibility — this surfaces the REAL cause of flaky tests: timing gaps, pending network calls, premature assertions. AUTO-INJECT: Data automatically included in self_heal_test when projectRoot is provided.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "traceFile": z.string().optional().describe("Optional: absolute path to a specific trace.zip. If omitted, uses the most recent trace in test-results/.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, traceFile } = args as any;
      const analysis = await traceAnalyzer.analyzeTrace(projectRoot, traceFile);
      return textResult(JSON.stringify(analysis, null, 2));
    }
  );
}
