import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectMaintenanceService } from '../services/setup/ProjectMaintenanceService.js';

function makeProject(): string {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'testforge-upgrade-'));
  fs.writeFileSync(
    path.join(projectRoot, 'package.json'),
    JSON.stringify({ scripts: { test: 'echo test' }, devDependencies: {} }, null, 2),
    'utf-8'
  );
  return projectRoot;
}

describe('ProjectMaintenanceService browser install verification', () => {
  test('does not claim browsers installed when launch verification fails', async () => {
    const projectRoot = makeProject();
    const commands: string[] = [];
    const service = new ProjectMaintenanceService({
      execFileRunner: async (file, args) => {
        commands.push(`${file} ${args.join(' ')}`);
        return {};
      },
      browserLaunchVerifier: async () => ({
        launchable: false,
        message: 'Executable does not exist at /fake/ms-playwright/chromium'
      })
    });

    const output = await service.upgradeProject(projectRoot);

    assert.ok(commands.some(command => command.includes('npx playwright install chromium firefox --with-deps')));
    assert.doesNotMatch(output, /✅ Playwright browsers installed\./);
    assert.match(output, /Playwright browser launch verification failed/);
    assert.match(output, /npx playwright install chromium firefox --with-deps/);
  });

  test('claims install success only after launch verification passes', async () => {
    const projectRoot = makeProject();
    const service = new ProjectMaintenanceService({
      execFileRunner: async () => ({}),
      browserLaunchVerifier: async () => ({
        launchable: true,
        message: 'Chromium launched successfully.'
      })
    });

    const output = await service.upgradeProject(projectRoot);

    assert.match(output, /✅ Playwright browsers installed and launch verified/);
    assert.doesNotMatch(output, /launch verification failed/);
  });

  test('skips browser reinstall when existing cache launches successfully', async () => {
    const projectRoot = makeProject();
    fs.mkdirSync(path.join(projectRoot, 'node_modules', 'playwright', '.local-browsers', 'chromium-test'), { recursive: true });
    const commands: string[] = [];
    const service = new ProjectMaintenanceService({
      execFileRunner: async (file, args) => {
        commands.push(`${file} ${args.join(' ')}`);
        return {};
      },
      browserLaunchVerifier: async () => ({
        launchable: true,
        message: 'Chromium launched successfully.'
      })
    });

    const output = await service.upgradeProject(projectRoot);

    assert.match(output, /already present and launch verified/);
    assert.equal(commands.some(command => command.includes('npx playwright install')), false);
  });
});
