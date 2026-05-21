import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { formatRunPlaywrightToolOutput, parseStructuredFailures } from '../tools/run_playwright_test.js';

describe('run_playwright_test output formatting', () => {
  test('does not report zero-test runs as successful', () => {
    const rawOutput = [
      '[TEST SUMMARY] ⚠️ NO TESTS RAN | passed: 0 | failed: 0 | skipped: 0',
      '[WARN] 0 tests matched. Possible causes:',
      'Fix: pass tags param to run_playwright_test',
    ].join('\n');

    const structured = parseStructuredFailures(rawOutput);
    const formatted = formatRunPlaywrightToolOutput(rawOutput);

    assert.equal(structured.noTestsRan, true);
    assert.equal(structured.passed, 0);
    assert.equal(structured.failed, 0);
    assert.ok(formatted.includes('NO TESTS RAN'));
    assert.ok(formatted.includes('"noTestsRan": true'));
    assert.ok(!formatted.includes('0 passed, 0 failed ✅'));
    assert.ok(!formatted.includes('[SUMMARY] 0 passed'));
  });

  test('parses Playwright-BDD compact pass/fail summaries', () => {
    const structured = parseStructuredFailures('PASS (1) FAIL (0)\n\nTime: 4421ms\n');

    assert.equal(structured.noTestsRan, false);
    assert.equal(structured.passed, 1);
    assert.equal(structured.failed, 0);
  });
});
