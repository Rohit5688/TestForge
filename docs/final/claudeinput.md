Let me check what TestForge already does vs what's being proposed, and what Playwright's actual API gives us.Now I have a complete picture of what TestForge currently does vs what's being proposed. Let me give a thorough, honest technical assessment.Good. Now I have the full picture — what TestForge does today, what Playwright actually exposes as public API, and what the proposal is really describing. Let me give you a precise technical assessment.

**The approach is correct. The mechanism description has one important inaccuracy. And TestForge is 80% of the way there already.**

---

**What Playwright CLI MCP actually does — the real mechanism**

The proposal says "the MCP asks the Playwright engine to calculate the best accessibility-first locator." This implies Playwright exposes a `generateLocator(element)` public API. It does not. The `playwright codegen` tool uses an internal method called `InjectedScript.generateSelector()` which is not part of the public library surface. It's accessible via `page.evaluate()` with `(window as any).__pwInjectedScript.generateSelector(element)` but that is an undocumented internal that can break on any release.

Playwright CLI MCP from Microsoft does not actually call that internal API. What it does is exactly what TestForge's `SmartDomExtractor` already does — it reads the accessibility tree (role + name + attributes) and constructs `getByRole` / `getByLabel` / `getByPlaceholder` strings itself using the same priority logic. The locators are "Playwright-native" because they follow Playwright's locator conventions, not because Playwright's engine generated them.

This matters because it means you do not need access to any internal Playwright API. You construct the strings yourself from the accessibility tree data you already have.

**What TestForge already does vs what needs to change**

Looking at `SmartDomExtractor.deriveSelector()` right now:

```
Current output:
[2] <button "Search"> → `role=button[name="Search"]`

Proposed output:
{"id": 2, "type": "button", "text": "Search", "locator": "page.getByRole('button', { name: 'Search', exact: true })"}
```

The data is identical. The role is `button`, the name is `Search`. The difference is purely formatting — converting from TestForge's internal selector notation to Playwright's public API string. That is a 30-minute change to `deriveSelector()`.

The gaps that are actually new:

First, `getByPlaceholder` is missing. `SmartDomExtractor` currently handles `input` elements via `role=textbox[name="..."]` but not `page.getByPlaceholder('Search items')`. For inputs with placeholder text, `getByPlaceholder` is more resilient. The accessibility snapshot includes placeholder values when present — just need to extract and use them.

Second, `getByLabel` is missing. Form inputs associated with a `<label>` element should prefer `getByLabel` over `getByRole('textbox')`. The aria snapshot surfaces the computed accessible name which includes label association — again, it's already in the data.

Third, the indexed element cache. This is the genuinely novel part of the proposal and also the most complex. If the LLM says "click element 3" rather than writing a locator, the MCP must maintain a server-side map of `{ id → locator string }` that persists between the inspect call and the subsequent action call. This requires `PlaywrightSessionService` to store the element map per session and look it up when an action tool is called. It also requires cache invalidation on navigation — element IDs from the product page are meaningless on the cart page.

**What the token numbers actually look like**

The proposal claims "less than 300 tokens" for the JSON output. For 3 elements that's accurate. For a realistic ecommerce page with 40-60 actionable elements — buttons, inputs, links, tabs — it's closer to 600-900 tokens. Still dramatically better than the current ~1,900 tokens per page after Fix 1 from the efficiency plan. The JSON format is denser than markdown and the structured output is easier for the LLM to parse accurately.

**The "no habit regression" claim is the strongest argument for this approach**

This is the part worth paying the most attention to. Currently TestForge returns `role=button[name="Search"]` which is TestForge's internal selector notation. The LLM reads this and writes `page.locator('role=button[name="Search"]')` in the generated code — which works but is not idiomatic Playwright. Sometimes under certain conditions the LLM pattern-matches this to a CSS selector and writes `.button-search` instead.

If you return `page.getByRole('button', { name: 'Search', exact: true })` as the locator string, the LLM copies it directly. There is no translation step, no opportunity for the LLM to substitute a worse pattern. The generated code is immediately idiomatic. This is a real quality improvement, not just a token saving.

**What to actually build**

Three changes, in priority order:

The first is convert `deriveSelector()` output to Playwright API strings. Change the return format from `role=button[name="Search"]` to `page.getByRole('button', { name: 'Search', exact: true })`. Add `getByPlaceholder` and `getByLabel` cases. Change the output from markdown to structured JSON. This directly delivers the token efficiency and "no habit regression" benefits. One afternoon of work.

The second is switch `inspect_page_dom` return format to the JSON array. The LLM gets `[{ id, role, text, locator }]` instead of markdown. This is a breaking change in output format — the generation prompt needs to be updated to reference elements by the new format. Also one afternoon.

The third is the indexed interaction cache — "click element ID 3." This is a week of work and introduces meaningful complexity around cache invalidation, session lifetime, and what happens when the page changes between inspect and action. It is the right long-term direction but I would do it after the first two are stable and you can measure the actual quality improvement from the locator string format change alone. The biggest wins come from the format change. The indexed cache is an optimisation on top of that.

One practical note: for the indexed cache to work properly with TestForge's BDD generation model — where inspect happens in one tool call and code is written in another — the cache needs to survive across multiple MCP tool calls within a session. That means `PlaywrightSessionService` needs to hold it, keyed by `(sessionId, pageUrl)`, and invalidated on any navigate call. That's the design constraint to solve before building it.
