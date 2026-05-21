import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TsConfigManager } from '../utils/TsConfigManager.js';

function makeProject(tsconfig: object): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testforge-tsconfig-'));
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2), 'utf-8');
  return root;
}

function readTsConfig(projectRoot: string): any {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf-8'));
}

describe('TsConfigManager path mappings', () => {
  test('adds baseUrl when adding compilerOptions.paths', () => {
    const root = makeProject({
      compilerOptions: {
        strict: true
      }
    });

    TsConfigManager.addPathMapping(root, 'pages');

    const tsconfig = readTsConfig(root);
    assert.equal(tsconfig.compilerOptions.baseUrl, '.');
    assert.deepEqual(tsconfig.compilerOptions.paths, {
      'pages/*': ['pages/*']
    });
  });

  test('preserves an existing custom baseUrl', () => {
    const root = makeProject({
      compilerOptions: {
        baseUrl: 'src',
        paths: {
          '@fixtures/*': ['fixtures/*']
        }
      }
    });

    TsConfigManager.addPathMapping(root, 'pages');

    const tsconfig = readTsConfig(root);
    assert.equal(tsconfig.compilerOptions.baseUrl, 'src');
    assert.deepEqual(tsconfig.compilerOptions.paths, {
      '@fixtures/*': ['fixtures/*'],
      'pages/*': ['pages/*']
    });
  });

  test('repairs existing paths without baseUrl even when the requested mapping already exists', () => {
    const root = makeProject({
      compilerOptions: {
        paths: {
          'pages/*': ['pages/*']
        }
      }
    });

    TsConfigManager.addPathMapping(root, 'pages');

    const tsconfig = readTsConfig(root);
    assert.equal(tsconfig.compilerOptions.baseUrl, '.');
    assert.deepEqual(tsconfig.compilerOptions.paths, {
      'pages/*': ['pages/*']
    });
  });
});
