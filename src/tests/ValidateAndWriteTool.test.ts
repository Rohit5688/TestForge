import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { registerValidateAndWrite } from '../tools/validate_and_write.js';
import { FileWriterService } from '../services/io/FileWriterService.js';

function makeProject(): { root: string; tsconfig: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testforge-vaw-'));
  const tsconfig = JSON.stringify({
    compilerOptions: {
      baseUrl: '.',
      paths: {}
    }
  }, null, 2);
  fs.writeFileSync(path.join(root, 'tsconfig.json'), tsconfig, 'utf-8');
  return { root, tsconfig };
}

describe('validate_and_write dryRun', () => {
  test('validates in staging without writing files, manifest, tsconfig, tests, or atomic writer', async () => {
    const { root, tsconfig } = makeProject();
    let handler: ((args: unknown) => Promise<any>) | undefined;
    let stagingCalled = false;
    let cleanupCalled = false;
    let runnerCalled = false;
    let orchestratorCalled = false;

    const server = {
      registerTool: (_name: string, _definition: unknown, toolHandler: (args: unknown) => Promise<any>) => {
        handler = toolHandler;
      }
    };
    const stagingService = {
      stageAndValidate: async () => {
        stagingCalled = true;
        return fs.mkdtempSync(path.join(os.tmpdir(), 'testforge-vaw-stage-'));
      },
      cleanup: (stagingDir: string) => {
        cleanupCalled = true;
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
    };
    const container = {
      resolve: (name: string) => {
        if (name === 'runner') {
          return {
            runTests: async () => {
              runnerCalled = true;
              throw new Error('runner must not execute during dryRun');
            }
          };
        }
        if (name === 'orchestrator') {
          return {
            createTestAtomically: async () => {
              orchestratorCalled = true;
              throw new Error('atomic writer must not execute during dryRun');
            }
          };
        }
        if (name === 'fileWriter') return new FileWriterService();
        if (name === 'stagingService') return stagingService;
        if (name === 'healer') return { analyzeFailure: async () => ({ canAutoHeal: false }) };
        if (name === 'analysisCache') return new Map();
        if (name === 'contextManager') return { purgeOldContext: () => undefined };
        throw new Error(`Unexpected service: ${name}`);
      }
    };

    registerValidateAndWrite(server as any, container as any);
    assert.ok(handler);

    const result = await handler({
      projectRoot: root,
      dryRun: true,
      files: [{
        path: 'features/dry-run.feature',
        content: 'Feature: Dry run\n  Scenario: Preview only\n    Given a generated feature'
      }]
    });

    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /^\[DRY RUN\]/);
    assert.equal(stagingCalled, true);
    assert.equal(cleanupCalled, true);
    assert.equal(runnerCalled, false);
    assert.equal(orchestratorCalled, false);
    assert.equal(fs.existsSync(path.join(root, 'features')), false);
    assert.equal(fs.existsSync(path.join(root, '.mcp-manifest.json')), false);
    assert.equal(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf-8'), tsconfig);
  });
});

describe('FileWriterService dryRun', () => {
  test('does not create parent directories, manifest, or tsconfig mappings', () => {
    const { root, tsconfig } = makeProject();
    const writer = new FileWriterService();

    const result = writer.writeFiles(root, [{
      path: 'features/dry-run.feature',
      content: 'Feature: Dry run'
    }], true);

    assert.equal(result.warnings.length, 0);
    assert.equal(result.written.length, 1);
    assert.equal(fs.existsSync(path.join(root, 'features')), false);
    assert.equal(fs.existsSync(path.join(root, '.mcp-manifest.json')), false);
    assert.equal(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf-8'), tsconfig);
  });
});
