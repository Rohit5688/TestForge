Let me read the actual current code first.Now I have a complete picture. Let me give the honest assessment.

---

The audit's diagnosis of the problem is correct — 93% of tokens on locator discovery is real and wasteful. But both suggestions it offers are wrong, and here's exactly why after reading the code.

**Suggestion 1: "Add a `purpose` or `targetElement` hint to filter inspect_page_dom"**

This sounds reasonable but falls apart in practice. The agent calls `inspect_page_dom` _before_ it knows which elements it needs — that's the whole point of the call. You're asking the agent to pre-filter a page it hasn't seen yet. In the 5-page ecommerce flow, the agent doesn't know it needs the "Add to Cart" button until it sees the product page exists. Making it pass `targetElement: "add to cart button"` as a hint requires the agent to already know the page structure — which defeats the purpose of the inspection. You'd get an LLM guessing element names before seeing them, which will hallucinate locators.

**Suggestion 2: "Rely on the screenshot instead of text snapshots for structural understanding"**

This is the opposite of fixing the token problem — screenshots in vision models cost more tokens than ARIA text, not less. A 1280×720 full-page screenshot encodes as roughly 1000-1500 tokens in Claude's vision system. The ARIA text output you're trying to replace is 3000-3500 tokens. So you'd save maybe 2000 tokens per page while losing the precise selector strings the agent needs to write working code. The screenshot tells you what a button looks like; it can't tell you `role=button[name="Add to Cart"]`.

**What the actual problem is**

Reading `SmartDomExtractor.extractFromAriaYaml()`, lines 271-276: after building the parsed actionable elements list, it _also appends the entire raw YAML_ up to 4000 characters. For a rich ecommerce page the YAML easily runs 5000-8000 characters, so you're hitting the 4000-char cap. That's **double output per page** — the parsed table and the raw YAML. Five pages means 5× that duplication. That one block is responsible for most of your 17,500 token DOM discovery cost. Remove it.

Beyond that, there's a workflow architecture issue. The current flow is: inspect page 1 → inspect page 2 → inspect page 3 → inspect page 4 → inspect page 5 → _then_ generate. By the time generation happens, all 5 DOM snapshots are sitting in conversation context simultaneously, even though the generator only needs one page's selectors at a time.

**The actual fixes, grounded in what the code does:**

The first fix is one line — remove the raw YAML append from `SmartDomExtractor.extractFromAriaYaml()`. The parsed actionable markdown already extracts everything useful from it. The raw YAML is there "for completeness" but completeness is the enemy of token efficiency. Remove lines 270-276 of SmartDomExtractor.ts entirely. That alone cuts per-page output from ~3500 tokens to ~800 tokens — a 4× reduction for free.

The second fix is in `ContextManager`. Right now it stores full DOM output and only compacts after 3 scans, keeping the last 2 full-size. For a 5-page flow that means pages 4 and 5 are always full-size in context. Change `RECENT_SCANS_TO_KEEP` from 2 to 1. You only need the current page's DOM; the previous pages' selectors are already in the generated code from the previous generation step.

The third fix is workflow, not code. The agent should generate page-by-page — inspect page 1, generate its page object, write it, _then_ inspect page 2. Not inspect all 5 then generate all 5. The `workflow_guide` tool already defines the `write_test` workflow; that workflow should enforce the per-page loop. Update its steps to say explicitly: "Complete generate + validate_and_write for each page before inspecting the next one." This keeps only one page's DOM in active context at a time instead of all 5.

The fourth fix addresses the 18k context input to the generator itself. Reading `TestGenerationService.generatePromptInstruction()`, it pulls the full analysis result including all existing step definitions and all page object method lists. For a mature project with 20+ page objects and 100+ steps, that's enormous. Add a relevance filter: only inject step definitions whose names contain words from the `testDescription`, and only inject page objects for pages that appear in the test description. This is the same tag-filtering logic from the LearningService improvement plan, applied to codebase context.

None of these require adding parameters to `inspect_page_dom`, and none require relying on screenshots. The token problem is architectural — running all discovery before any generation — and has a line-level fix in SmartDomExtractor that you can ship in 20 minutes.
