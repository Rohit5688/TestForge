import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Command } from "commander";
import express from "express";

import { container } from "./container/ServiceContainer.js";
import { registerAllTools } from "./tools/toolRegistry.js";

const server = new McpServer({
  name: "appforge",
  version: "1.0.0"
});

registerAllTools(server, container);


const program = new Command();

program
  .name("TestForge")
  .description("MCP server for Playwright-BDD POM generation");

program
  .command("serve", { isDefault: true })
  .description("Start the MCP server (Stdio or SSE)")
  .option("--port <number>", "Port to run HTTP server on")
  .option("--host <string>", "Host to run HTTP server on", "127.0.0.1")
  .action(async (options) => {
    await startServer(options);
  });

program.parse(process.argv);

async function startServer(options: { port?: string; host?: string }) {
  if (options.port) {
    // Streamable HTTP Transport (replaces deprecated SSEServerTransport)
    const app = express();
    app.use(express.json());

    app.post("/mcp", async (req, res) => {
      // Stateless: fresh transport per request (no sessionIdGenerator = stateless mode)
      const transport = new StreamableHTTPServerTransport({});
      // Cast required: upstream SDK type bug — StreamableHTTPServerTransport.onclose
      // is typed as `(() => void) | undefined` but Transport interface requires `() => void`.
      await server.connect(transport as any);
      await transport.handleRequest(req, res, req.body);
      // Cleanup after response is complete
      res.on("close", () => { transport.close(); });
    });

    const port = parseInt(options.port, 10);
    const host = options.host || "127.0.0.1";
    app.listen(port, host, () => {
      console.log(`[TestForge] Remote HTTP listening on http://${host}:${port}/mcp`);
    });
  } else {
    // Stdio Transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Silent startup log, as stdio is in use
  }
}
