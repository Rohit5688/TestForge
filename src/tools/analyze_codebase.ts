import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { CodebaseAnalysisResult } from "../interfaces/ICodebaseAnalyzer.js";

export function registerAnalyzeCodebase(server: McpServer, container: ServiceContainer) {
  const analyzer = container.resolve<any>("analyzer");
  const analysisCache = container.resolve<Map<string, CodebaseAnalysisResult>>("analysisCache");

  server.registerTool(
    "analyze_codebase",
    {
      description: `TRIGGER: Scan existing codebase structure before generating code. FOR TINY PROJECTS (<5 files) ONLY.
RETURNS: { existingSteps[], existingPageObjects[], existingUtils[] }
NEXT: Use results to inform test generation → Call generate_gherkin_pom_test_suite.
COST: High (reads ALL source files — use execute_sandbox_code for large projects, 98% fewer tokens)
ERROR_HANDLING: Standard

Analyzes the codebase using AST. Only use this for very small projects (< 5 files). FOR LARGE PROJECTS, ALWAYS USE 'execute_sandbox_code' (Turbo Mode) instead.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "customWrapperPackage": z.string().optional().describe("Optional package name or local path for base page objects.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, customWrapperPackage } = args as any;
      const analysis = await analyzer.analyze(projectRoot, customWrapperPackage);
      analysisCache.set(projectRoot, analysis);
      return textResult(JSON.stringify(analysis, null, 2));
    }
  );
}
