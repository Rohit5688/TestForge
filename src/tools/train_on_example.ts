import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { LearningService } from "../services/system/LearningService.js";

export function registerTrainOnExample(server: McpServer, container: ServiceContainer) {
  const learningService = container.resolve<LearningService>("learningService");

  server.registerTool(
    "train_on_example",
    {
      description: `TRIGGER: After manually correcting an AI generation error.
RETURNS: Saved rule confirmation — pattern, solution stored in mcp-learning.json.
NEXT: Continue generating — the fix is now in persistent memory, won't repeat.
COST: Low (~50-100 tokens)
ERROR_HANDLING: Standard

Injects custom team knowledge or learned coding fixes into the persistent MCP memory.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project."),
        "issuePattern": z.string().describe("The recurring error or structural ambiguity (e.g., 'Locating shadow root elements on login page', 'Missing await on dynamic loader')."),
        "solution": z.string().describe("The exact code snippet or strategy required to overcome the issue."),
        "tags": z.array(z.string()).optional().describe("Optional module or feature tags.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, issuePattern, solution, tags } = args as any;
      const rule = learningService.learn(projectRoot, issuePattern, solution, tags || []);
      const responseText = `Successfully learned new rule!\nSaved to mcp-learning.json\nPattern: ${rule.pattern}\nSolution: ${rule.solution}`;
      return textResult(truncate(responseText));
    }
  );
}
