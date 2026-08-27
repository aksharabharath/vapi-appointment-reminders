import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSessionToken, passwordMatches, verifySessionToken } from './staff-session';

test('passwordMatches accepts the expected password', async () => {
  assert.equal(await passwordMatches('office-key', 'office-key'), true);
  assert.equal(await passwordMatches('wrong', 'office-key'), false);
});

test('session tokens verify until they expire', async () => {
  const secret = 'test-staff-password';
  const token = await createSessionToken(secret, 1_000);
  assert.equal(await verifySessionToken(token, secret, 1_000), true);
  assert.equal(await verifySessionToken(token, secret, 1_000 + 13 * 60 * 60 * 1000), false);
  assert.equal(await verifySessionToken(token, 'other-secret', 1_000), false);
  assert.equal(await verifySessionToken('v1.not-a-token', secret, 1_000), false);
});
