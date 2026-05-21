import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { extractFeaturePathsFromArgs, TestRunnerService } from '../services/execution/TestRunnerService.js';

function withFakeNpx(projectRoot: string, testBody: (callsPath: string) => Promise<void>): Promise<void> {
  const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'testforge-fake-bin-'));
  const callsPath = path.join(projectRoot, 'calls.jsonl');
  const npxPath = path.join(fakeBin, process.platform === 'win32' ? 'npx.cmd' : 'npx');
  const script = [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    "fs.appendFileSync(process.env.TESTFORGE_CALLS, JSON.stringify(process.argv.slice(2)) + '\\n');",
    "if (process.argv[2] === 'playwright') console.log('PASS (1) FAIL (0)');",
  ].join('\n');
  fs.writeFileSync(npxPath, script, 'utf-8');
  fs.chmodSync(npxPath, 0o755);

  const oldPath = process.env.PATH;
  const oldCalls = process.env.TESTFORGE_CALLS;
  process.env.PATH = `${fakeBin}${path.delimiter}${oldPath ?? ''}`;
  process.env.TESTFORGE_CALLS = callsPath;
  return testBody(callsPath).finally(() => {
    process.env.PATH = oldPath;
    if (oldCalls == null) {
      delete process.env.TESTFORGE_CALLS;
    } else {
      process.env.TESTFORGE_CALLS = oldCalls;
    }
  });
}

function readCalls(callsPath: string): string[][] {
  return fs.readFileSync(callsPath, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

describe('TestRunnerService custom executionCommand', () => {
  test('uses mcp-config executionCommand and recognizes compact Playwright-BDD output', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'testforge-runner-config-'));
    fs.writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({
        scripts: {
          'automated-test': 'node -e "console.log(\'PASS (1) FAIL (0)\')"'
        }
      }, null, 2),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectRoot, 'mcp-config.json'),
      JSON.stringify({
        version: '2.4.0',
        executionCommand: 'npm run automated-test',
        timeouts: { testRun: 10000 }
      }, null, 2),
      'utf-8'
    );

    const result = await new TestRunnerService().runTests(projectRoot);

    assert.equal(result.passed, true);
    assert.match(result.output, /passed: 1/);
    assert.doesNotMatch(result.output, /NO TESTS RAN/);
  });
});

describe('TestRunnerService bddgen filtering', () => {
  test('passes tag filters to bddgen before Playwright receives grep args', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'testforge-runner-tags-'));
    fs.writeFileSync(path.join(projectRoot, 'mcp-config.json'), JSON.stringify({
      version: '2.4.0',
      timeouts: { testRun: 10000 }
    }), 'utf-8');

    await withFakeNpx(projectRoot, async (callsPath) => {
      const result = await new TestRunnerService().runTests(
        projectRoot,
        '--grep @target --project chromium',
        undefined,
        undefined,
        { tags: '@target' }
      );

      const calls = readCalls(callsPath);
      assert.equal(result.passed, true);
      assert.deepEqual(calls[0], ['bddgen', '--tags', '@target']);
      assert.deepEqual(calls[1], ['playwright', 'test', '--grep', '@target', '--project', 'chromium']);
    });
  });

  test('creates a temporary bddgen config for specific feature runs', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'testforge-runner-feature-'));
    fs.mkdirSync(path.join(projectRoot, 'features'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'features', 'target.feature'), 'Feature: Target\n', 'utf-8');
    fs.writeFileSync(path.join(projectRoot, 'playwright.config.ts'), 'export default {};\n', 'utf-8');
    fs.writeFileSync(path.join(projectRoot, 'mcp-config.json'), JSON.stringify({
      version: '2.4.0',
      timeouts: { testRun: 10000 }
    }), 'utf-8');

    await withFakeNpx(projectRoot, async (callsPath) => {
      const result = await new TestRunnerService().runTests(
        projectRoot,
        'features/target.feature --project chromium'
      );

      const calls = readCalls(callsPath);
      const bddConfigIndex = calls[0]!.indexOf('--config');
      const bddConfigPath = calls[0]![bddConfigIndex + 1]!;
      const generatedConfig = fs.readFileSync(path.join(projectRoot, bddConfigPath), 'utf-8');

      assert.equal(result.passed, true);
      assert.equal(calls[0]![0], 'bddgen');
      assert.ok(bddConfigIndex > -1);
      assert.deepEqual(calls[1], ['playwright', 'test', '--config', bddConfigPath, 'features/target.feature', '--project', 'chromium']);
      assert.match(generatedConfig, /features\/target\.feature/);
      assert.match(generatedConfig, /bddConfig\.features = requestedFeatures/);
    });
  });

  test('extracts feature paths while ignoring non-feature Playwright args', () => {
    assert.deepEqual(
      extractFeaturePathsFromArgs('features/a.feature --project chromium --grep @smoke features/b.feature:12'),
      ['features/a.feature', 'features/b.feature']
    );
  });
});
