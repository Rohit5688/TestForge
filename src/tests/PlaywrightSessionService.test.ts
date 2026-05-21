import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { PlaywrightSessionService } from '../services/execution/PlaywrightSessionService.js';

describe('PlaywrightSessionService navigate auto-start handling', () => {
  test('returns start-session failure directly instead of null-dereferencing page.goto', async () => {
    class FailingAutoStartSession extends PlaywrightSessionService {
      public override async startSession(): Promise<string> {
        return JSON.stringify({
          success: false,
          error: 'Failed to start session: browser executable missing'
        }, null, 2);
      }
    }

    const result = await new FailingAutoStartSession().navigate('http://127.0.0.1:8765/');
    const parsed = JSON.parse(result);

    assert.equal(parsed.success, false);
    assert.equal(parsed.error, 'Failed to start session: browser executable missing');
    assert.doesNotMatch(result, /Cannot read properties of null/);
    assert.doesNotMatch(result, /goto/);
  });

  test('returns a clear error if auto-start reports success but no page is created', async () => {
    class BrokenAutoStartSession extends PlaywrightSessionService {
      public override async startSession(): Promise<string> {
        return JSON.stringify({
          success: true,
          message: 'Started but page missing'
        }, null, 2);
      }
    }

    const result = await new BrokenAutoStartSession().navigate('http://127.0.0.1:8765/');
    const parsed = JSON.parse(result);

    assert.equal(parsed.success, false);
    assert.match(parsed.error, /auto-start did not create a browser page/);
    assert.doesNotMatch(result, /Cannot read properties of null/);
  });
});
