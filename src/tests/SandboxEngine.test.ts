/**
 * SandboxEngine.test.ts — Unit tests for the V8 Sandbox Engine.
 *
 * Tests verify:
 * 1. Basic script execution works.
 * 2. The forge.api bridge correctly invokes registered services.
 * 3. Dangerous patterns (eval, require, process) are blocked.
 * 4. Timeouts are enforced.
 * 5. Console logs are captured.
 * 6. Errors inside scripts are handled gracefully.
 * 7. No global state leaks between executions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeSandbox } from '../services/execution/SandboxExecutionService.js';
import type { SandboxApiRegistry } from '../services/execution/SandboxExecutionService.js';

describe('SandboxEngine - Core Execution', () => {
  it('should execute a simple script and return a result', async () => {
    const result = await executeSandbox('return 42;', {});
    assert.equal(result.success, true);
    assert.equal(result.result, 42);
  });

  it('should execute string manipulation', async () => {
    const result = await executeSandbox(`
      const greeting = 'Hello, ' + 'TestForge!';
      return greeting;
    `, {});
    assert.equal(result.success, true);
    assert.equal(result.result, 'Hello, TestForge!');
  });

  it('should handle JSON operations', async () => {
    const result = await executeSandbox(`
      const data = JSON.parse('{"name":"TestForge","version":1}');
      return data.name + ' v' + data.version;
    `, {});
    assert.equal(result.success, true);
    assert.equal(result.result, 'TestForge v1');
  });
});

describe('SandboxEngine - API Bridge', () => {
  it('should call a registered API method and return its result', async () => {
    const api: SandboxApiRegistry = {
      getLocator: async () => '#login-button',
    };
    const result = await executeSandbox(`
      const locator = await forge.api.getLocator();
      return locator;
    `, api);
    assert.equal(result.success, true);
    assert.equal(result.result, '#login-button');
  });

  it('should pass arguments to API methods', async () => {
    const api: SandboxApiRegistry = {
      findByRole: async (args: { role: string; name: string }) => {
        return `getByRole('${args.role}', { name: '${args.name}' })`;
      },
    };
    const result = await executeSandbox(`
      const selector = await forge.api.findByRole({ role: 'button', name: 'Submit' });
      return selector;
    `, api);
    assert.equal(result.success, true);
    assert.equal(result.result, "getByRole('button', { name: 'Submit' })");
  });

  it('should handle API method errors gracefully', async () => {
    const api: SandboxApiRegistry = {
      failingMethod: async () => { throw new Error('Service unavailable'); },
    };
    const result = await executeSandbox(`
      const data = await forge.api.failingMethod();
      return data;
    `, api);
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('Service unavailable'));
  });

  it('should support multiple API calls in sequence', async () => {
    let callCount = 0;
    const api: SandboxApiRegistry = {
      increment: async () => { callCount++; return callCount; },
    };
    const result = await executeSandbox(`
      const a = await forge.api.increment();
      const b = await forge.api.increment();
      const c = await forge.api.increment();
      return [a, b, c];
    `, api);
    assert.equal(result.success, true);
    assert.equal(JSON.stringify(result.result), JSON.stringify([1, 2, 3]));
  });
});

describe('SandboxEngine - Security (Zero-Trust)', () => {
  it('should block eval()', async () => {
    const result = await executeSandbox(`return eval('1+1');`, {});
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('eval'));
  });

  it('should block new Function()', async () => {
    const result = await executeSandbox(`return new Function('return 1')();`, {});
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('Function'));
  });

  it('should block require()', async () => {
    const result = await executeSandbox(`const fs = require('fs'); return fs;`, {});
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('require'));
  });

  it('should block process access', async () => {
    const result = await executeSandbox(`return process.env;`, {});
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('process'));
  });

  it('should block dynamic import()', async () => {
    const result = await executeSandbox(`const m = await import('fs'); return m;`, {});
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('import'));
  });

  it('should block globalThis access', async () => {
    const result = await executeSandbox(`return globalThis.constructor;`, {});
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('globalThis'));
  });
});

describe('SandboxEngine - Timeout Enforcement', () => {
  it('should timeout on long-running scripts', async () => {
    const result = await executeSandbox(`
      while(true) {} // Infinite loop
    `, {}, { timeoutMs: 100 });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('timed out') || result.error?.includes('Script execution timed out'));
  });
});

describe('SandboxEngine - Console Capture', () => {
  it('should capture console.log output', async () => {
    const result = await executeSandbox(`
      console.log('Step 1: Finding locator');
      console.log('Step 2: Done');
      return 'ok';
    `, {});
    assert.equal(result.success, true);
    assert.equal(result.logs.length, 2);
    assert.equal(result.logs[0], 'Step 1: Finding locator');
    assert.equal(result.logs[1], 'Step 2: Done');
  });

  it('should capture console.warn and console.error', async () => {
    const result = await executeSandbox(`
      console.warn('Warning message');
      console.error('Error message');
      return 'ok';
    `, {});
    assert.equal(result.success, true);
    assert.equal(result.logs[0], '[WARN] Warning message');
    assert.equal(result.logs[1], '[ERROR] Error message');
  });
});

describe('SandboxEngine - Isolation', () => {
  it('should not leak state between executions', async () => {
    // Run 1: set a variable
    await executeSandbox(`
      const secret = 'leaked-data';
      return secret;
    `, {});

    // Run 2: try to access the variable from run 1
    const result = await executeSandbox(`
      try {
        return typeof secret;
      } catch(e) {
        return 'undefined';
      }
    `, {});
    assert.equal(result.success, true);
    assert.equal(result.result, 'undefined');
  });

  it('should report execution duration', async () => {
    const result = await executeSandbox(`return 1 + 1;`, {});
    assert.equal(result.success, true);
    assert.ok(result.durationMs >= 0);
  });
});

describe('SandboxEngine - Real-World Token Optimization Scenario', () => {
  it('should simulate a DOM inspection with filtered results', async () => {
    // Simulate a large DOM tree (what inspect_page_dom would return)
    const fakeDomNodes = Array.from({ length: 500 }, (_, i) => ({
      role: i % 10 === 0 ? 'button' : 'generic',
      name: i % 10 === 0 ? `Button ${i}` : `Node ${i}`,
      selector: `#node-${i}`,
    }));

    const api: SandboxApiRegistry = {
      getLiveDom: async () => fakeDomNodes,
    };

    // The LLM writes this small script instead of receiving 500 DOM nodes
    const result = await executeSandbox(`
      const tree = await forge.api.getLiveDom();
      const buttons = tree.filter(n => n.role === 'button');
      console.log('Found ' + buttons.length + ' buttons out of ' + tree.length + ' nodes');
      return buttons.map(b => ({ name: b.name, selector: b.selector }));
    `, api);

    assert.equal(result.success, true);
    // Only 50 buttons out of 500 nodes — massive token savings!
    assert.equal(result.result.length, 50);
    assert.equal(result.logs[0], 'Found 50 buttons out of 500 nodes');
    // The LLM receives ~50 results instead of ~500 raw nodes
  });
});
