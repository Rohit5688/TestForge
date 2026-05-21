import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { redactUserStoreReadResult } from '../tools/manage_users.js';

describe('manage_users redaction', () => {
  test('redacts credential values from list responses', () => {
    const redacted = redactUserStoreReadResult({
      environment: 'staging',
      filePath: '/tmp/project/test-data/users.staging.json',
      exists: true,
      roles: ['admin', 'standard'],
      users: {
        admin: {
          username: 'admin@example.com',
          password: 'real-admin-password',
          role: 'admin',
          displayName: 'Admin User',
        },
        standard: {
          username: 'standard@example.com',
          password: 'secret_sauce',
          role: 'standard',
        },
      },
    });

    const output = JSON.stringify(redacted);
    assert.equal(redacted.redacted, true);
    assert.equal(redacted.userCount, 2);
    assert.deepEqual(redacted.roles, ['admin', 'standard']);
    const admin = redacted.users.admin;
    assert.ok(admin);
    assert.deepEqual(admin.fields, ['username', 'password', 'role', 'displayName']);
    assert.equal(admin.role, 'admin');
    assert.equal(admin.redacted, true);
    assert.ok(!output.includes('admin@example.com'));
    assert.ok(!output.includes('real-admin-password'));
    assert.ok(!output.includes('standard@example.com'));
    assert.ok(!output.includes('secret_sauce'));
    assert.ok(!output.includes('Admin User'));
  });
});
