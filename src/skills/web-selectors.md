---
name: testforge-web-selectors
description: Choose selectors that satisfy TestForge generator and locator audit rules.
---

# TestForge Web Selectors

Use this skill when generating or healing locators in TestForge page objects. This is not CSS-first guidance; TestForge expects semantic and utility locator helpers before CSS fallback.

## Locator Priority

1. `getLocatorByTestId` for stable `data-testid` or equivalent test id attributes.
2. `getLocatorByRole` with accessible name for interactive controls and landmarks.
3. `getLocatorByLabel` for form fields.
4. `getLocatorByText` for stable user-visible copy.
5. `getLocatorByPlaceholder` when placeholder text is the best available accessible signal.
6. CSS only as fallback when semantic locators are unavailable.

## Page Object Pattern

- Import locator helpers from `vasu-playwright-utils` when the project uses the TestForge wrapper.
- Keep locators and raw page interactions in page objects, not step definitions.
- Prefer accessible names that match what a user sees or hears.
- Add a stable test id in the app when no reliable semantic locator exists.

## Avoid

- XPath.
- Raw CSS class selectors as primary locators.
- `nth-child`, generated class names, animation/layout selectors, and deep DOM chains.
- Treating failed `inspect_page_dom` output as proof that a selector exists.

## Verification

- Use `inspect_page_dom` or `gather_test_context` before creating selectors from a live page.
- Use `verify_selector` for uncertain selectors when a TestForge browser session is active.
- If selector healing changes a page object, rerun the smallest affected tag or feature.
