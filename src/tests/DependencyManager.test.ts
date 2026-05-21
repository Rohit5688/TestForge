import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { DependencyManager } from '../utils/DependencyManager.js';

describe('DependencyManager install diagnostics', () => {
  test('returns failed command details when npm install fails', async () => {
    const manager = new DependencyManager(async () => {
      const error: any = new Error('Command failed: npm install');
      error.code = 127;
      error.stderr = 'npm: command not found';
      throw error;
    });

    const result = await manager.installDependenciesDetailed('/tmp/project');

    assert.equal(result.success, false);
    assert.equal(result.npmInstalled, false);
    assert.equal(result.browsersInstalled, false);
    assert.equal(result.steps[0]?.name, 'npm install');
    assert.equal(result.steps[0]?.command, 'npm install');
    assert.equal(result.steps[0]?.exitCode, 127);
    assert.equal(result.steps[0]?.stderr, 'npm: command not found');
    assert.equal(result.steps[1]?.name, 'playwright install');
    assert.equal(result.steps[1]?.skipped, true);
  });

  test('splits npm success from browser install failure', async () => {
    const manager = new DependencyManager(async (_file, args) => {
      if (args[0] === 'playwright') {
        const error: any = new Error('Command failed: npx playwright install chromium firefox --with-deps');
        error.code = 1;
        error.stderr = 'browser download failed';
        throw error;
      }
      return {};
    });

    const result = await manager.installDependenciesDetailed('/tmp/project');

    assert.equal(result.success, false);
    assert.equal(result.npmInstalled, true);
    assert.equal(result.browsersInstalled, false);
    assert.equal(result.steps[1]?.command, 'npx playwright install chromium firefox --with-deps');
    assert.equal(result.steps[1]?.stderr, 'browser download failed');
  });
});
