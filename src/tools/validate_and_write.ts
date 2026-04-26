import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult } from "./_helpers.js";
import { TestRunnerService } from "../services/execution/TestRunnerService.js";
import { JsonToPomTranspiler } from "../utils/JsonToPomTranspiler.js";
import { JsonToStepsTranspiler } from "../utils/JsonToStepsTranspiler.js";
import { OrchestrationService } from "../services/system/OrchestrationService.js";
import type { SelfHealingService } from "../services/execution/SelfHealingService.js";
import type { CodebaseAnalysisResult } from "../interfaces/ICodebaseAnalyzer.js";
import { LastResultStore } from "../services/system/LastResultStore.js";
import { McpErrors } from "../types/ErrorSystem.js";

export function registerValidateAndWrite(server: McpServer, container: ServiceContainer) {
  const runner = container.resolve<TestRunnerService>("runner");
  const orchestration = container.resolve<OrchestrationService>("orchestrator");
  const healer = container.resolve<SelfHealingService>("healer");
  const analysisCache = container.resolve<Map<string, CodebaseAnalysisResult>>("analysisCache");
  const contextManager = container.resolve<any>("contextManager");

  server.registerTool(
    "validate_and_write",
    {
      description: `TRIGGER: After generating code content in memory.
RETURNS: On success — [WRITE DIFF] block (✅ created / ✏️ modified per file with line count) + test run summary. On failure — [REJECTION] block with exact file + violated pattern.
NEXT: If [REJECTION] → fix flagged pattern → retry. If verification failed → call self_heal_test (context auto-stored).
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
          // Fix-3: Pre-validate required fields before transpiling
          const missingPo = ['path', 'className', 'locators', 'methods'].filter(k => !(k in po));
          if (missingPo.length > 0) {
            throw McpErrors.projectValidationFailed(
              `[REJECTION] jsonPageObjects entry is missing required fields: ${missingPo.join(', ')}\n` +
              `Entry received: ${JSON.stringify(Object.keys(po))}\n` +
              `NEXT: Fix the jsonPageObjects entry — every entry MUST have: path, className, locators[], methods[]`,
              'validate_and_write',
              { suggestedNextTools: ['validate_and_write'] }
            );
          }
          resolvedFiles.push({
            path: po.path,
            content: JsonToPomTranspiler.transpile(po)
          });
        }
      }
      if (jsonSteps) {
        for (const steps of jsonSteps) {
          // Fix-3: Pre-validate required fields before transpiling
          const missingSteps = ['path', 'pageImports', 'steps'].filter(k => !(k in steps));
          if (missingSteps.length > 0) {
            throw McpErrors.projectValidationFailed(
              `[REJECTION] jsonSteps entry is missing required fields: ${missingSteps.join(', ')}\n` +
              `Entry received: ${JSON.stringify(Object.keys(steps))}\n` +
              `NEXT: Fix the jsonSteps entry — every entry MUST have: path, pageImports[], steps[]`,
              'validate_and_write',
              { suggestedNextTools: ['validate_and_write'] }
            );
          }
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
        const msg = e instanceof Error ? e.message : String(e);
        const fileMatch = msg.match(/(?:in file|file:?)\s+([^\s,]+)/i);
        const patternMatch = msg.match(/(?:native locator|pattern|violation|found):\s*(.+?)(?:\n|$)/i);
        const detail = [
          `[REJECTION] Validation failed — do NOT retry blindly.`,
          fileMatch ? `  File: ${fileMatch[1]}` : '',
          patternMatch ? `  Violated pattern: ${patternMatch[1]?.trim()}` : '',
          `  Raw error: ${msg}`,
          `NEXT: Fix the flagged pattern in generated content then call validate_and_write again.`
        ].filter(Boolean).join('\n');
        const errorOpts: Record<string, any> = { suggestedNextTools: ['validate_and_write', 'execute_sandbox_code'] };
        if (fileMatch) {
          errorOpts.file = fileMatch[1];
        }
        throw McpErrors.projectValidationFailed(detail, 'validate_and_write', errorOpts);
      }


      if (dryRun) {
        return textResult(`Dry run successful. Files that would be written:\n${writeResult.filesWritten.join("\n")}`);
      }

      // 3. Verification run
      let testResultRaw = await runner.runTests(projectRoot);

      // Write to shared store so self_heal_test auto-loads context if verification fails
      LastResultStore.getInstance().write({
        projectRoot,
        passed: testResultRaw.passed,
        output: testResultRaw.output,
        failureClass: null,
        failedLocators: [],
        timestamp: Date.now(),
      });

      // If success, cleanup context
      if (testResultRaw.passed) {
        try {
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
        } else {
          // Fix-3b: Hard signal when healing is not possible
          return textResult(
            `[HALT] ⛔ VERIFICATION FAILED — CANNOT AUTO-HEAL\n` +
            `Files were written but tests failed and the failure cannot be auto-healed.\n` +
            `MANDATORY NEXT STEP: Call self_heal_test to classify the failure, then call request_user_clarification if still unresolved.\n\n` +
            `Raw failure:\n${testResultRaw.output.slice(0, 1000)}`
          );
        }
      }

      // Build [WRITE DIFF] block — line-count delta per file
      const diffLines: string[] = ['[WRITE DIFF]'];
      for (const f of writeResult.filesWritten) {
        const absPath = path.isAbsolute(f) ? f : path.join(projectRoot, f);
        const newContent = resolvedFiles.find((rf: any) => path.join(projectRoot, rf.path) === absPath || rf.path === f);
        const newLines = newContent ? newContent.content.split('\n').length : 0;
        const existed = fs.existsSync(absPath);
        diffLines.push(`  ${existed ? '✏️ modified' : '✅ created'} ${f} (${newLines} lines)`);
      }

      return textResult(
        `Files written successfully:\n${writeResult.filesWritten.join('\n')}\n\n` +
        `${diffLines.join('\n')}\n\n` +
        `Initial verification run:\n${testResultRaw.output}`
      );
    }
  );
}
