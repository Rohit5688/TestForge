import { ServiceContainer } from "../container/ServiceContainer.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpErrors } from "../types/ErrorSystem.js";

// Helper for tool responses
export function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }]
  };
}

// Helper for truncating long logs or DOM snapshots
const CHARACTER_LIMIT = 25_000;
export function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return text.slice(0, CHARACTER_LIMIT) + "\n\n... [TRUNCATED]";
}

/**
 * URL validation — restricts browser tools to http/https only.
 * Throws McpErrors.invalidParameter if the protocol is not http: or https:.
 */
export function validateUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw McpErrors.invalidParameter('url', `Invalid URL: "${url}"`, 'inspect_page_dom');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw McpErrors.invalidParameter(
      'url',
      `Blocked URL protocol "${parsed.protocol}". Only http: and https: are allowed.`,
      'inspect_page_dom'
    );
  }
}


/**
 * Common tool dependencies resolver
 */
export function getService<T>(container: ServiceContainer, name: string): T {
  return container.resolve<T>(name);
}
