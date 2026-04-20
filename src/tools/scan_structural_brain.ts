import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { StructuralBrainService } from "../services/analysis/StructuralBrainService.js";

export function registerScanStructuralBrain(server: McpServer, container: ServiceContainer) {
  const structuralBrain = container.resolve<StructuralBrainService>("structuralBrain");

  server.registerTool(
    "scan_structural_brain",
    {
      description: `TRIGGER: Identify God Nodes (>5 connections) in the architecture before planning refactors.
RETURNS: List of risky files with connection counts — modify cautiously.
NEXT: Avoid touching God Nodes directly → Use Adapters or targeted surgical edits.
COST: Low (~100-200 tokens)
ERROR_HANDLING: Standard

Scans import graph and caches God Nodes.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot } = args as any;
      const reportNodes = await structuralBrain.scanProject(projectRoot);
      return textResult(JSON.stringify(reportNodes, null, 2));
    }
  );
}
