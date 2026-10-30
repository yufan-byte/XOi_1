import test from 'node:test';
import assert from 'node:assert/strict';
import { executionWindow } from '../lib/workspace/mediaTiming';

test('video execution window covers submission, provider polling and content download', () => {
  const providerMaximum = (2 + 20 + 10) * 60_000;
  assert.ok(executionWindow('video', {}) > providerMaximum);
  assert.ok(executionWindow('image', {}) > 11 * 60_000);
});

test('one-stop project work still respects its own deadline', () => {
  assert.equal(executionWindow('one-stop', { deadlineAt: 1500 }, 1000), 500);
});
