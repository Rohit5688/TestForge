import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { redactEnvReadResult, redactEnvWriteResult } from '../tools/manage_env.js';

describe('manage_env redaction', () => {
  test('redacts all env values from read responses', () => {
    const redacted = redactEnvReadResult({
      keys: ['API_TOKEN', 'BASE_URL'],
      values: {
        API_TOKEN: 'supersecret-token-1234567890',
        BASE_URL: 'https://www.saucedemo.com',
      },
      envFilePath: '/tmp/project/.env',
      exists: true,
    });

    const output = JSON.stringify(redacted);
    assert.equal(redacted.values.API_TOKEN, '[REDACTED]');
    assert.equal(redacted.values.BASE_URL, '[REDACTED]');
    assert.equal(redacted.redacted, true);
    assert.ok(!output.includes('supersecret-token-1234567890'));
    assert.ok(!output.includes('https://www.saucedemo.com'));
  });

  test('redacts written values from write responses', () => {
    const redacted = redactEnvWriteResult({
      written: [
        'API_TOKEN=supersecret-token-1234567890',
        'BASE_URL=https://www.saucedemo.com',
      ],
      skipped: ['EXISTING_TOKEN'],
      envFilePath: '/tmp/project/.env',
    });

    const output = JSON.stringify(redacted);
    assert.deepEqual(redacted.written, ['API_TOKEN', 'BASE_URL']);
    assert.equal(redacted.redacted, true);
    assert.ok(!output.includes('supersecret-token-1234567890'));
    assert.ok(!output.includes('https://www.saucedemo.com'));
  });
});
