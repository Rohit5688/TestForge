import fs from 'fs';
import path from 'path';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import type { LearningService } from "../services/system/LearningService.js";

export function registerExportTeamKnowledge(server: McpServer, container: ServiceContainer) {
  const learningService = container.resolve<LearningService>("learningService");

  server.registerTool(
    "export_team_knowledge",
    {
      description: `TRIGGER: Share the AI's internal knowledge base with the team.
RETURNS: Path to exported docs/team-knowledge.md Markdown file.
NEXT: Commit team-knowledge.md to repository → Share learned rules with team.
COST: Low (~50-100 tokens)
ERROR_HANDLING: Standard

Exports the mcp-learning.json brain into a human-readable Markdown file.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot } = args as any;
      const md = learningService.exportToMarkdown(projectRoot);
      const docsDir = path.join(projectRoot, 'docs');
      if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
      const filePath = path.join(docsDir, 'team-knowledge.md');
      fs.writeFileSync(filePath, md, 'utf8');
      return {
        content: [{
          type: "text",
          text: `📝 Team knowledge exported to ${filePath}.\nCommit this file to share learned rules with the team.`
        }]
      };
    }
  );
}
