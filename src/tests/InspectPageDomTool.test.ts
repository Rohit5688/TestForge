import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { isDomInspectionFailure, registerInspectPageDom } from '../tools/inspect_page_dom.js';

describe('inspect_page_dom failure handling', () => {
  test('detects DomInspectorService error strings before JSON cache success handling', () => {
    assert.equal(
      isDomInspectionFailure('[ERROR] Failed to inspect DOM at http://127.0.0.1:9:\nbrowserType.launch failed'),
      true
    );
  });

  test('does not treat valid JSON DOM output as a failure', () => {
    assert.equal(
      isDomInspectionFailure('[{"tag":"button","selectorArgs":{"role":"button","name":"Login"}}]'),
      false
    );
  });

  test('returns an MCP error and skips cache/context writes when JSON inspection fails', async () => {
    let handler: ((args: unknown) => Promise<any>) | undefined;
    const cache = new Map<string, string>();
    let recordedScan = false;

    const server = {
      registerTool: (_name: string, _definition: unknown, toolHandler: (args: unknown) => Promise<any>) => {
        handler = toolHandler;
      }
    };
    const container = {
      resolve: (name: string) => {
        if (name === 'domInspector') {
          return { inspect: async () => '[ERROR] Failed to inspect DOM at http://127.0.0.1:9:\nbrowser launch failed' };
        }
        if (name === 'domInspectionCache') return cache;
        if (name === 'contextManager') {
          return { recordScan: () => { recordedScan = true; } };
        }
        if (name === 'session') return { getPage: () => undefined };
        if (name === 'mcpConfig') {
          return { read: () => ({ enableVisualExploration: false, timeouts: { domInspection: 1000 } }) };
        }
        throw new Error(`Unexpected service: ${name}`);
      }
    };

    registerInspectPageDom(server as any, container as any);
    assert.ok(handler);

    const result = await handler({
      url: 'http://127.0.0.1:9/',
      projectRoot: '/tmp/project',
      returnFormat: 'json'
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /^\[ERROR\]/);
    assert.equal(cache.has('/tmp/project'), false);
    assert.equal(recordedScan, false);
    assert.doesNotMatch(result.content[0].text, /inspected and cached/i);
  });
});
