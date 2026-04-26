import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult, truncate } from "./_helpers.js";
import { StructuralBrainService } from "../services/analysis/StructuralBrainService.js";

export function registerScanStructuralBrain(server: McpServer) {

  server.registerTool(
    "scan_structural_brain",
    {
      description: `TRIGGER: Before editing any file — check if it's a god node and which files will be directly affected.
RETURNS: God node list with severity + "editing this affects: [fileA, fileB]" (1-hop only). Safe-to-edit verdict per file.
NEXT: If target file is a god node → surgical replace_file_content only, ripple-audit listed dependents after.
COST: Low (~100-200 tokens)
ERROR_HANDLING: Standard

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "projectRoot": z.string().describe("Absolute path to the automation project.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot } = args as any;
      const brainService = new StructuralBrainService(projectRoot);
      brainService.invalidateCache();
      const godNodes = await brainService.scanProject();

      if (godNodes.length === 0) {
        return textResult('No god nodes detected. All files safe to edit freely.');
      }

      const lines: string[] = [`God Nodes (${godNodes.length}) — edit with caution:\n`];
      for (const n of godNodes) {
        const icon = n.severity === 'critical' ? '🔴' : '🟡';
        lines.push(`${icon} ${n.file} — ${n.connections} dependents [${n.severity}]`);
        const affected = (n.importedBy ?? []).slice(0, 10);
        if (affected.length > 0) {
          lines.push(`   editing this affects: ${affected.join(', ')}${n.connections > 10 ? ` (+${n.connections - 10} more)` : ''}`);
        }
        lines.push('');
      }

      return textResult(lines.join('\n'));
    }
  );
}

