import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildPackageScriptCommandPlan,
  buildTrustedCommandPlan,
  parseCommandLine,
  splitCommandSegments
} from '../utils/CommandPolicy.js';

function makeProject(scripts: Record<string, string>): string {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'testforge-command-policy-'));
  fs.writeFileSync(
    path.join(projectRoot, 'package.json'),
    JSON.stringify({ scripts }, null, 2),
    'utf-8'
  );
  return projectRoot;
}

describe('CommandPolicy', () => {
  test('parses quoted command arguments without invoking a shell', () => {
    assert.deepEqual(parseCommandLine('npm run custom:e2e -- --grep "@smoke test"'), [
      'npm',
      'run',
      'custom:e2e',
      '--',
      '--grep',
      '@smoke test'
    ]);
  });

  test('splits trusted command chains on top-level && only', () => {
    assert.deepEqual(splitCommandSegments('npx bddgen && npx playwright test --grep "a && b"'), [
      'npx bddgen',
      'npx playwright test --grep "a && b"'
    ]);
  });

  test('allows any package.json script name without a hardcoded allowlist', () => {
    const projectRoot = makeProject({
      'automated-test': 'playwright test',
      'gold:e2e': 'playwright test'
    });

    const automated = buildPackageScriptCommandPlan(projectRoot, 'npm run automated-test -- --grep @smoke');
    const gold = buildPackageScriptCommandPlan(projectRoot, 'npm run gold:e2e');

    assert.equal(automated.exe, process.platform === 'win32' ? 'npm.cmd' : 'npm');
    assert.deepEqual(automated.args, ['run', 'automated-test', '--', '--grep', '@smoke']);
    assert.deepEqual(gold.args, ['run', 'gold:e2e']);
  });

  test('rejects arbitrary override commands', () => {
    const projectRoot = makeProject({ 'automated-test': 'playwright test' });

    assert.throws(
      () => buildPackageScriptCommandPlan(projectRoot, 'node -v'),
      /overrideCommand must call a package script/
    );
  });

  test('rejects shell chaining in override commands', () => {
    const projectRoot = makeProject({ 'automated-test': 'playwright test' });

    assert.throws(
      () => buildPackageScriptCommandPlan(projectRoot, 'npm run automated-test && cat .env'),
      /single package-script command/
    );
  });

  test('builds trusted config command plans without a shell', () => {
    const plan = buildTrustedCommandPlan('npx bddgen && npx playwright test --project chromium');

    assert.deepEqual(plan.map(segment => [segment.exe, segment.args]), [
      ['npx', ['bddgen']],
      ['npx', ['playwright', 'test', '--project', 'chromium']]
    ]);
  });
});
