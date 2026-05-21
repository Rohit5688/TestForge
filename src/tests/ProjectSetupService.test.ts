import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectSetupService } from '../services/setup/ProjectSetupService.js';
import { DependencyManager } from '../utils/DependencyManager.js';

function makePhaseTwoProject(): string {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'testforge-setup-'));
  fs.writeFileSync(
    path.join(projectRoot, 'mcp-config.json'),
    JSON.stringify({ version: '2.4.0' }, null, 2),
    'utf-8'
  );
  return projectRoot;
}

describe('ProjectSetupService dependency install reporting', () => {
  test('phase 2 scaffolds sample smoke steps and TestForge agent skills', async () => {
    const projectRoot = makePhaseTwoProject();
    fs.mkdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
    const service = new ProjectSetupService();

    const parsed = JSON.parse(await service.setup(projectRoot));

    assert.equal(parsed.status, 'SETUP_COMPLETE');
    assert.ok(parsed.filesCreated.includes('features/sample.feature'));
    assert.ok(parsed.filesCreated.includes('step-definitions/sample.steps.ts'));
    assert.ok(parsed.filesCreated.includes('.github/agents/testforge-agent.agent.md'));
    assert.ok(parsed.filesCreated.includes('.github/skills/testforge-new-bdd-test.md'));
    assert.ok(parsed.filesCreated.includes('.github/skills/testforge-api-testing.md'));
    assert.ok(parsed.filesCreated.includes('.github/skills/testforge-playwright-bdd.md'));
    assert.ok(parsed.filesCreated.includes('.github/skills/testforge-web-selectors.md'));
    assert.equal(fs.existsSync(path.join(projectRoot, 'features', 'sample.feature')), true);
    assert.equal(fs.existsSync(path.join(projectRoot, 'step-definitions', 'sample.steps.ts')), true);
    assert.equal(fs.existsSync(path.join(projectRoot, '.github', 'agents', 'testforge-agent.agent.md')), true);
    assert.equal(fs.existsSync(path.join(projectRoot, '.github', 'skills', 'testforge-run-and-heal.md')), true);
    assert.equal(fs.existsSync(path.join(projectRoot, '.github', 'skills', 'testforge-api-testing.md')), true);
  });

  test('does not report SETUP_COMPLETE when npm install fails', async () => {
    const projectRoot = makePhaseTwoProject();
    const dependencyManager = new DependencyManager(async () => {
      const error: any = new Error('Command failed: npm install');
      error.code = 1;
      error.stderr = 'registry unavailable';
      throw error;
    });
    const service = new ProjectSetupService(undefined, dependencyManager);

    const output = await service.setup(projectRoot);
    const parsed = JSON.parse(output);

    assert.equal(parsed.status, 'SETUP_BLOCKED');
    assert.equal(parsed.installed, false);
    assert.equal(parsed.installDetails.npmInstalled, false);
    assert.equal(parsed.installDetails.browsersInstalled, false);
    assert.equal(parsed.installDetails.steps[0].command, 'npm install');
    assert.equal(parsed.installDetails.steps[0].exitCode, 1);
    assert.equal(parsed.installDetails.steps[0].stderr, 'registry unavailable');
    assert.match(parsed.message, /Setup blocked/);
    assert.match(parsed.message, /failedCommand: npm install/);
    assert.doesNotMatch(parsed.message, /Package install skipped \(node_modules already present or install failed\)/);
  });

  test('reports browser install failure separately after npm succeeds', async () => {
    const projectRoot = makePhaseTwoProject();
    const dependencyManager = new DependencyManager(async (_file, args) => {
      if (args[0] === 'playwright') {
        const error: any = new Error('Command failed: npx playwright install');
        error.code = 1;
        error.stderr = 'missing system dependency';
        throw error;
      }
      return {};
    });
    const service = new ProjectSetupService(undefined, dependencyManager);

    const parsed = JSON.parse(await service.setup(projectRoot));

    assert.equal(parsed.status, 'SETUP_BLOCKED');
    assert.equal(parsed.installDetails.npmInstalled, true);
    assert.equal(parsed.installDetails.browsersInstalled, false);
    assert.equal(parsed.installDetails.steps[1].command, 'npx playwright install chromium firefox --with-deps');
    assert.match(parsed.message, /browsersInstalled: false/);
  });
});
