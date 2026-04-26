import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Command } from "commander";
import express from "express";
import { container } from "./container/ServiceContainer.js";
import { registerAllTools } from "./tools/toolRegistry.js";
import { TokenBudgetService } from "./services/config/TokenBudgetService.js";
import { ObservabilityService } from "./services/analysis/ObservabilityService.js";
const server = new McpServer({
    name: "appforge",
    version: "1.0.0"
});
// --- TOKEN BUDGET TRACKING INTERCEPTOR ---
const originalTool = server.tool;
const originalRegisterTool = server.registerTool;
function wrapHandler(name, handler) {
    return async (args, extra) => {
        const budgetService = TokenBudgetService.getInstance();
        const obsService = ObservabilityService.getInstance();
        const inputStr = JSON.stringify(args || {});
        let outputStr = "";
        const startTimeMs = Date.now();
        const projectRoot = args?.projectRoot;
        const traceId = obsService.toolStart(name, args || {});
        try {
            const result = await handler(args, extra);
            outputStr = typeof result === 'string' ? result : JSON.stringify(result || {});
            const footer = budgetService.trackToolCall(name, inputStr, outputStr);
            obsService.toolEnd(traceId, name, true, { resultLength: outputStr.length }, startTimeMs, projectRoot);
            if (result && Array.isArray(result.content)) {
                const textContent = result.content.find((c) => c.type === 'text');
                if (textContent && typeof textContent.text === 'string') {
                    textContent.text += `\n\n${footer}`;
                }
            }
            return result;
        }
        catch (err) {
            outputStr = err.message || String(err);
            budgetService.trackToolCall(name, inputStr, outputStr);
            obsService.toolError(traceId, name, err, startTimeMs, projectRoot);
            throw err;
        }
    };
}
if (originalTool) {
    server.tool = function (name, p1, p2, p3) {
        if (typeof p2 === 'function') {
            return originalTool.call(this, name, p1, wrapHandler(name, p2));
        }
        if (typeof p3 === 'function') {
            return originalTool.call(this, name, p1, p2, wrapHandler(name, p3));
        }
        return originalTool.apply(this, arguments);
    };
}
if (originalRegisterTool) {
    server.registerTool = function (name, options, handler) {
        if (typeof handler === 'function') {
            return originalRegisterTool.call(this, name, options, wrapHandler(name, handler));
        }
        return originalRegisterTool.apply(this, arguments);
    };
}
// -----------------------------------------
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
async function startServer(options) {
    if (options.port) {
        // Streamable HTTP Transport (replaces deprecated SSEServerTransport)
        const app = express();
        app.use(express.json());
        app.post("/mcp", async (req, res) => {
            // Stateless: fresh transport per request (no sessionIdGenerator = stateless mode)
            const transport = new StreamableHTTPServerTransport({});
            // Cast required: upstream SDK type bug — StreamableHTTPServerTransport.onclose
            // is typed as `(() => void) | undefined` but Transport interface requires `() => void`.
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
            // Cleanup after response is complete
            res.on("close", () => { transport.close(); });
        });
        const port = parseInt(options.port, 10);
        const host = options.host || "127.0.0.1";
        app.listen(port, host, () => {
            console.log(`[TestForge] Remote HTTP listening on http://${host}:${port}/mcp`);
        });
    }
    else {
        // Stdio Transport
        const transport = new StdioServerTransport();
        await server.connect(transport);
        // Silent startup log, as stdio is in use
    }
}
//# sourceMappingURL=index.js.map