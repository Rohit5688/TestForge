import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ensureWritableErrorStackTraceLimit } from '../utils/PlaywrightRuntime.js';

describe('PlaywrightRuntime', () => {
  test('makes Error.stackTraceLimit writable before Playwright loads', () => {
    const original = Object.getOwnPropertyDescriptor(Error, 'stackTraceLimit');

    try {
      Object.defineProperty(Error, 'stackTraceLimit', {
        value: 10,
        writable: false,
        configurable: true
      });

      assert.throws(
        () => { (Error as any).stackTraceLimit = 20; },
        /Cannot assign to read only property|read only/
      );

      ensureWritableErrorStackTraceLimit();
      (Error as any).stackTraceLimit = 20;

      assert.equal((Error as any).stackTraceLimit, 20);
      assert.equal(Object.getOwnPropertyDescriptor(Error, 'stackTraceLimit')?.writable, true);
    } finally {
      if (original) {
        Object.defineProperty(Error, 'stackTraceLimit', original);
      }
    }
  });
});
