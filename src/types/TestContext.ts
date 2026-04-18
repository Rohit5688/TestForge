/**
 * TestContext — Shared types for pre-generation DOM and network context.
 *
 * Philosophy: Spend cheap input tokens gathering verified data before generation,
 * so the LLM writes correct selectors and synchronisation calls on the first pass —
 * eliminating the healing-retry completion-token cost.
 *
 * Version field is a literal type so a stale context (from a different schema) is
 * caught at the prompt boundary, never silently injected.
 */

export interface NetworkCall {
  /** HTTP verb: GET | POST | PUT | DELETE | PATCH */
  method: string;
  /** Path only — no host, no query string. e.g. /api/auth/login */
  urlPath: string;
  /** HTTP status code returned by the server */
  status: number;
}

export interface PageElement {
  /** ARIA role: button | textbox | link | heading | checkbox | combobox | radio | … */
  role: string;
  /** Accessible name (aria-label, visible text, placeholder) */
  name: string;
  /** Ready-to-paste Playwright locator string, e.g. page.getByRole('button', { name: 'Sign in' }) */
  locator: string;
  /** For text inputs: text | password | email | search | number */
  inputType?: string;
}

export interface PageContext {
  /** URL as requested */
  requestedUrl: string;
  /** URL after any server-side redirects */
  resolvedUrl: string;
  /** Document <title> */
  title: string;
  /** Actionable elements found by accessibility snapshot */
  elements: PageElement[];
  /** XHR/fetch calls that fired during page load — basis for waitForResponse() calls */
  networkOnLoad: NetworkCall[];
}

export interface TestContext {
  /** Schema version — bump when shape changes to detect stale cached contexts */
  version: '1';
  /** ISO 8601 timestamp when this context was gathered */
  gatheredAt: string;
  /** The base URL used for crawling */
  baseUrl: string;
  /** One entry per URL visited, in order */
  pages: PageContext[];
}
