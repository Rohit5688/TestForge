import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import { TestRunnerService } from "../services/execution/TestRunnerService.js";
import { JsonToPomTranspiler } from "../utils/JsonToPomTranspiler.js";
import { JsonToStepsTranspiler } from "../utils/JsonToStepsTranspiler.js";
import { OrchestrationService } from "../services/system/OrchestrationService.js";
import type { SelfHealingService } from "../services/execution/SelfHealingService.js";
import type { CodebaseAnalysisResult } from "../interfaces/ICodebaseAnalyzer.js";

export function registerValidateAndWrite(server: McpServer, container: ServiceContainer) {
  const runner = container.resolve<TestRunnerService>("runner");
  const orchestration = container.resolve<OrchestrationService>("orchestrator");
  const healer = container.resolve<SelfHealingService>("healer");
  const analysisCache = container.resolve<Map<string, CodebaseAnalysisResult>>("analysisCache");

  server.registerTool(
    "validate_and_write",
    {
      description: `TRIGGER: After generating code content in memory.
RETURNS: You pass the structured files to write as an array.
NEXT: Evaluate output → Proceed
COST: Low
ERROR_HANDLING: Standard

Writes the AI-generated test files to disk, runs them, and attempts auto-healing up to 3 times on failure.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the test project."),
        "files": z.array(z.object({
          "path": z.string().describe("Relative path to the file."),
          "content": z.string().describe("The code contents to write.")
        })).describe("Array of files to write. Each must have a 'path' (relative) and 'content' (string)."),
        "jsonPageObjects": z.array(z.object({
          "path": z.string(),
          "className": z.string(),
          "extendsClass": z.string().optional(),
          "imports": z.array(z.string()).optional(),
          "locators": z.array(z.object({
            "name": z.string(),
            "selector": z.string(),
            "isArray": z.boolean().optional()
          })),
          "methods": z.array(z.object({
            "name": z.string(),
            "args": z.array(z.string()).optional(),
            "isAsync": z.boolean().optional(),
            "body": z.array(z.string())
          }))
        })).optional().describe("Optional structured JSON representations of Page Objects (bypasses raw TS formatting)."),
        "jsonSteps": z.array(z.object({
          "path": z.string(),
          "pageImports": z.array(z.string()),
          "steps": z.array(z.object({
            "type": z.enum(["Given", "When", "Then"]),
            "pattern": z.string(),
            "page": z.string().optional(),
            "method": z.string().optional(),
            "args": z.array(z.string()).optional(),
            "params": z.array(z.string()).optional(),
            "body": z.array(z.string()).optional()
          }))
        })).optional().describe("Optional compact step file descriptors. Server assembles full playwright-bdd TypeScript, saving ~70% completion tokens vs raw strings."),
        "dryRun": z.boolean().optional().describe("If true, audits and validates the files but skips writing to disk and testing. Returns a preview."),
        "pageUrl": z.string().optional().describe("Optional URL used to re-inspect the DOM during self-healing retries.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, files, jsonPageObjects, jsonSteps, dryRun, pageUrl } = args as any;

      // 1. Resolve JSON structures to raw files if provided
      const resolvedFiles = [...files];
      if (jsonPageObjects) {
        for (const po of jsonPageObjects) {
          resolvedFiles.push({
            path: po.path,
            content: JsonToPomTranspiler.transpile(po)
          });
        }
      }
      if (jsonSteps) {
        for (const steps of jsonSteps) {
          resolvedFiles.push({
            path: steps.path,
            content: JsonToStepsTranspiler.transpile(steps)
          });
        }
      }

      // 2. Perform atomic write (stages, validates, then writes if valid)
      let writeResult;
      try {
        writeResult = await orchestration.createTestAtomically(projectRoot, resolvedFiles);
      } catch (e) {
        return textResult(`Validation or Writing failed: ${e instanceof Error ? e.message : String(e)}`);
      }

      if (dryRun) {
        return textResult(`Dry run successful. Files that would be written:\n${writeResult.filesWritten.join("\n")}`);
      }

      // 3. Verification run
      let testResultRaw = await runner.runTests(projectRoot);

      // If success, cleanup context
      if (testResultRaw.passed) {
        try {
          const contextManager = container.resolve<any>("contextManager");
          contextManager.purgeOldContext(projectRoot);
        } catch {
          // Ignore context purge errors
        }
        
        // Invalidate analysis cache as structure changed
        analysisCache.delete(projectRoot);
      } else {
          // If verification failed, wrap failure with healing instructions
          const analysis = await healer.analyzeFailure(testResultRaw.output, '', 'default', projectRoot);
          if (analysis.canAutoHeal) {
              return textResult(
                  `Files written, but verification failed.\n\n` +
                  `HEALING INSTRUCTIONS:\n${analysis.healInstruction}\n\n` +
                  `Original Output:\n${testResultRaw.output}`
              );
          }
      }

      return textResult(
        `Files written successfully:\n${writeResult.filesWritten.join("\n")}\n\n` +
        `Initial verification run:\n${testResultRaw.output}`
      );
    }
  );
}
