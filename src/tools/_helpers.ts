import { ServiceContainer } from "../container/ServiceContainer.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
 * Common tool dependencies resolver
 */
export function getService<T>(container: ServiceContainer, name: string): T {
  return container.resolve<T>(name);
}
