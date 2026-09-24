import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isYswsEligible } from '../src/lib/server/verification.js';

test('isYswsEligible accepts only true', () => {
	assert.equal(isYswsEligible(true), true);
	assert.equal(isYswsEligible(false), false);
	assert.equal(isYswsEligible('true'), false);
	assert.equal(isYswsEligible(undefined), false);
});
