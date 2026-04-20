import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { Questioner } from "../utils/Questioner.js";

export function registerRequestUserClarification(server: McpServer, container: ServiceContainer) {
  server.registerTool(
    "request_user_clarification",
    {
      description: `TRIGGER: CRITICAL — Call when you encounter an architectural ambiguity or missing requirement.
RETURNS: SYSTEM HALT directive — blocks execution until user answers.
NEXT: Wait for user answer → Incorporate their response into the plan.
COST: Low (~50 tokens)
ERROR_HANDLING: Always halts — throws to surface question to user.

Halts execution to prompt the human user with your question.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
      inputSchema: z.object({
        "question": z.string().describe("The exact question you want to ask the user."),
        "options": z.array(z.string()).describe("Optional: a list of suggested choices to make it easier for the user to reply.").optional(),
        "context": z.string().describe("A brief explanation of WHY you are blocked and need clarification.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const { question, options, context } = args as any;
      Questioner.clarify(question, context, options);
      return { content: [] }; // Never reached since clarify throws
    }
  );
}
