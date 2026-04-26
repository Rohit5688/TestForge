import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContainer } from "../container/ServiceContainer.js";
import { textResult, truncate } from "./_helpers.js";
import type { TestContextGathererService } from "../services/dom/TestContextGathererService.js";
import type { TestContext, NetworkCall } from "../types/TestContext.js";

/**
 * P3: Network Contract Auto-Map
 * Classifies XHR calls from gather_test_context into mutation vs query,
 * and generates ready-to-paste waitForResponse() patterns.
 */
function buildNetworkContract(context: TestContext): string {
  const mutations: { url: string; method: string; snippet: string }[] = [];
  const queries: { url: string; snippet: string }[] = [];

  for (const page of context.pages) {
    for (const call of (page.networkOnLoad ?? [])) {
      const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(call.method.toUpperCase());
      // Generate URL pattern — strip query strings, keep path segments
      const urlPattern = `**${call.urlPath}`;

      if (isMutation) {
        mutations.push({
          url: call.urlPath,
          method: call.method,
          snippet: `await page.waitForResponse(resp => resp.url().includes('${call.urlPath}') && resp.request().method() === '${call.method}');`
        });
      } else if (call.status === 200) {
        queries.push({
          url: call.urlPath,
          snippet: `await page.waitForResponse('${urlPattern}');`
        });
      }
    }
  }

  if (mutations.length === 0 && queries.length === 0) {
    return '\n[NETWORK CONTRACT] No XHR/fetch calls captured — page may be static or SSR-rendered.';
  }

  const lines = ['\n[NETWORK CONTRACT] Auto-mapped from captured network activity:\n'];

  if (mutations.length > 0) {
    lines.push('⚡ MUTATIONS — Use waitForResponse() AFTER the triggering action:');
    for (const m of mutations) {
      lines.push(`  [${m.method}] ${m.url}`);
      lines.push(`    → ${m.snippet}`);
    }
  }

  if (queries.length > 0) {
    lines.push('\n📡 QUERIES — Use waitForResponse() before asserting rendered data:');
    for (const q of queries) {
      lines.push(`  [GET] ${q.url}`);
      lines.push(`    → ${q.snippet}`);
    }
  }

  lines.push('\n⚠️ Paste the relevant snippet BEFORE assertions that depend on the response data.');
  lines.push('⚠️ For mutations — call waitForResponse() in a Promise.all() with the click action.');

  return lines.join('\n');
}

export function registerGatherTestContext(server: McpServer, container: ServiceContainer) {
  const gatherer = container.resolve<TestContextGathererService>("gatherer");

  server.registerTool(
    "gather_test_context",
    {
      description: `TRIGGER: BEFORE calling generate_gherkin_pom_test_suite when writing tests for a web app you have NOT inspected yet.
RETURNS: TestContext JSON — verified DOM elements (roles, labels, locators) and XHR/fetch network calls (for waitForResponse patterns). Also includes [NETWORK CONTRACT] block with ready-to-paste waitForResponse() snippets for all mutation and query endpoints.
NEXT: Pass returned testContext to generate_gherkin_pom_test_suite → Eliminates selector guessing, achieves first-pass correct code.
COST: High (headless browser per URL, ~500-2000 tokens depending on page count)
ERROR_HANDLING: Standard

Visits each URL in your test flow, captures verified DOM elements and XHR/fetch calls from a headless browser.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        "baseUrl": z.string().describe("Base URL of the application, e.g. https://app.example.com"),
        "paths": z.array(z.string()).describe("Relative paths to visit in order, e.g. [\"/login\", \"/dashboard\"]. May also be full URLs."),
        "storageState": z.string().optional().describe("Path to Playwright storageState JSON for pre-authenticated crawls."),
        "loginMacro": z.object({
          "loginPath": z.string(),
          "userSelector": z.string(),
          "usernameValue": z.string(),
          "passSelector": z.string(),
          "passwordValue": z.string(),
          "submitSelector": z.string()
        }).optional().describe("Optional: perform a login before visiting protected paths.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async (args) => {
      const { baseUrl, paths, storageState, loginMacro } = args as any;
      const context = await gatherer.gather({
        baseUrl,
        paths,
        storageState,
        loginMacro
      });

      // P3: Append network contract block to raw JSON output
      const networkContract = buildNetworkContract(context);
      return textResult(JSON.stringify(context, null, 2) + networkContract);
    }
  );
}

