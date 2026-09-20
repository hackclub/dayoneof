import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHcaVerified } from '../src/lib/server/verification.js';

test('isHcaVerified accepts both verified statuses', () => {
	assert.equal(isHcaVerified('verified_eligible'), true);
	assert.equal(isHcaVerified('verified_but_over_18'), true);
});

test('isHcaVerified rejects everything else', () => {
	assert.equal(isHcaVerified('needs_submission'), false);
	assert.equal(isHcaVerified('pending'), false);
	assert.equal(isHcaVerified('rejected'), false);
	assert.equal(isHcaVerified(undefined), false);
});
