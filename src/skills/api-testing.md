---
name: testforge-api-testing
description: Write API, auth, and network interception tests using TestForge MCP project conventions.
---

# TestForge API Testing

Use this skill for REST checks, auth setup, storage state, and browser-triggered network assertions in TestForge-scaffolded Playwright-BDD projects.

## Request API

- Use Playwright `APIRequestContext`; do not add axios or node-fetch.
- In TestForge singleton-style steps, prefer `getRequest()` from `vasu-playwright-utils` for pure API calls.
- Fixture destructuring with `request` is allowed when the step explicitly needs Playwright fixtures for an API or interception scenario.

```typescript
import { getRequest } from 'vasu-playwright-utils';

const request = getRequest();
const response = await request.post('/api/v1/auth', { data: payload });
```

## Auth and Secrets

- Use `manage_env` for environment values.
- Never hardcode tokens, passwords, or API keys in Gherkin, step definitions, page objects, or test data.
- Acquire auth through API calls when it avoids slow UI login, then save `storageState` when the flow needs a browser session.
- Keep user records in `manage_users` where appropriate; secret values returned from TestForge are intentionally redacted.

## Assertions

- Assert exact expected status with `response.status()`.
- Assert `response.ok()` only when any 2xx response is acceptable.
- Validate important JSON fields with deep equality or schema checks.
- Put complex request and response shapes in typed interfaces under `models/`.

## Browser Network Interception

- Register `page.route` before the browser action that triggers the request.
- Use `Promise.all` with the action and `waitForResponse` to avoid missed responses.
- Keep intercepted API assertions close to the business behavior represented by the scenario.
