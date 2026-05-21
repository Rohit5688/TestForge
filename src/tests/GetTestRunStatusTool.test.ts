import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { summarizeDetachedRunStatus } from '../tools/get_test_run_status.js';

describe('get_test_run_status detached summary', () => {
  test('marks completed logs with no test counts as failed no-tests-ran', () => {
    const summary = summarizeDetachedRunStatus('v20.19.3\n', 0);

    assert.equal(summary.status, 'failed');
    assert.equal(summary.noTestsRan, true);
    assert.equal(summary.passed, 0);
    assert.equal(summary.failed, 0);
  });

  test('recognizes Playwright-BDD compact pass/fail output', () => {
    const passed = summarizeDetachedRunStatus('PASS (1) FAIL (0)\n\nTime: 4421ms\n', 0);
    const failed = summarizeDetachedRunStatus('PASS (0) FAIL (1)\n\n1. Test failed\n', 1);

    assert.equal(passed.status, 'passed');
    assert.equal(passed.noTestsRan, false);
    assert.equal(passed.passed, 1);
    assert.equal(passed.failed, 0);

    assert.equal(failed.status, 'failed');
    assert.equal(failed.noTestsRan, false);
    assert.equal(failed.passed, 0);
    assert.equal(failed.failed, 1);
  });
});
