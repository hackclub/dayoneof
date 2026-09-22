import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	isDuplicatePost,
	isPostTooOld,
	computeStreak,
	daysCompletedCount,
	freezesEarned,
	resolveMissedDay,
	nextMilestone
} from '../src/lib/server/streak.js';

/** @typedef {import('../src/lib/server/streak.js').Day} Day */

test('isDuplicatePost detects an existing posted day', () => {
	/** @type {Day[]} */
	const days = [{ date: '2026-01-01', status: 'posted' }];
	assert.equal(isDuplicatePost(days, '2026-01-01'), true);
	assert.equal(isDuplicatePost(days, '2026-01-02'), false);
});

test('isPostTooOld rejects only past the two-day mark', () => {
	const now = new Date('2026-01-10T12:00:00Z');
	assert.equal(isPostTooOld('2026-01-10T11:00:00Z', now), false);
	assert.equal(isPostTooOld('2026-01-08T12:00:01Z', now), false);
	assert.equal(isPostTooOld('2026-01-08T11:59:59Z', now), true);
	assert.equal(isPostTooOld('2025-12-01T00:00:00Z', now), true);
	assert.equal(isPostTooOld('2026-01-08T12:00:00+00:00', now), false);
});

test('isPostTooOld allows a post whose age cannot be known', () => {
	const now = new Date('2026-01-10T12:00:00Z');
	assert.equal(isPostTooOld(null, now), false);
	assert.equal(isPostTooOld(undefined, now), false);
	assert.equal(isPostTooOld('', now), false);
	assert.equal(isPostTooOld('not a date', now), false);
});

test('computeStreak counts back from the most recent day', () => {
	/** @type {Day[]} */
	const days = [
		{ date: '2026-01-01', status: 'posted' },
		{ date: '2026-01-02', status: 'posted' },
		{ date: '2026-01-03', status: 'frozen' },
		{ date: '2026-01-04', status: 'posted' }
	];
	assert.equal(computeStreak(days), 4);
});

test('computeStreak stops at a missed day', () => {
	/** @type {Day[]} */
	const days = [
		{ date: '2026-01-01', status: 'posted' },
		{ date: '2026-01-02', status: 'missed' },
		{ date: '2026-01-03', status: 'posted' }
	];
	assert.equal(computeStreak(days), 1);
});

test('daysCompletedCount only counts posted days', () => {
	/** @type {Day[]} */
	const days = [
		{ date: '2026-01-01', status: 'posted' },
		{ date: '2026-01-02', status: 'frozen' },
		{ date: '2026-01-03', status: 'missed' }
	];
	assert.equal(daysCompletedCount(days), 1);
});

test('freezesEarned grants one per two days, capped at three', () => {
	assert.equal(freezesEarned(0), 0);
	assert.equal(freezesEarned(1), 0);
	assert.equal(freezesEarned(4), 2);
	assert.equal(freezesEarned(10), 3);
});

test('resolveMissedDay spends a freeze when one is available', () => {
	assert.deepEqual(resolveMissedDay(2), { status: 'frozen', freezesRemaining: 1, broke: false });
});

test('resolveMissedDay breaks the streak with no freezes left', () => {
	assert.deepEqual(resolveMissedDay(0), { status: 'missed', freezesRemaining: 0, broke: true });
});

test('nextMilestone fires once per threshold crossed', () => {
	assert.equal(nextMilestone(2, null), 2);
	assert.equal(nextMilestone(2, 2), null);
	assert.equal(nextMilestone(10, 7), null);
	assert.equal(nextMilestone(15, 7), 15);
});
