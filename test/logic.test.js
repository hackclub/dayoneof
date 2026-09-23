import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	streakDay,
	addDays,
	isPostTooOld,
	freezesAfterPost,
	settleMissedDays,
	nextMilestone
} from '../src/lib/server/streak.js';

test('streakDay rolls over at 1am local time', () => {
	assert.equal(streakDay('UTC', new Date('2026-01-10T00:59:00Z')), '2026-01-09');
	assert.equal(streakDay('UTC', new Date('2026-01-10T01:00:00Z')), '2026-01-10');
	assert.equal(streakDay('America/New_York', new Date('2026-01-10T05:30:00Z')), '2026-01-09');
	assert.equal(streakDay('America/New_York', new Date('2026-01-10T06:00:00Z')), '2026-01-10');
	assert.equal(streakDay(undefined, new Date('2026-01-10T12:00:00Z')), '2026-01-10');
});

test('addDays crosses month and year boundaries', () => {
	assert.equal(addDays('2026-01-31', 1), '2026-02-01');
	assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('isPostTooOld rejects only past the given age limit', () => {
	const now = new Date('2026-01-10T12:00:00Z');
	assert.equal(isPostTooOld('2026-01-10T11:00:00Z', 2, now), false);
	assert.equal(isPostTooOld('2026-01-08T12:00:01Z', 2, now), false);
	assert.equal(isPostTooOld('2026-01-08T11:59:59Z', 2, now), true);
	assert.equal(isPostTooOld('2025-12-01T00:00:00Z', 2, now), true);
	assert.equal(isPostTooOld('2026-01-08T12:00:00+00:00', 2, now), false);
	assert.equal(isPostTooOld('2026-01-08T11:59:59Z', 5, now), false);
	assert.equal(isPostTooOld('2026-01-08T11:59:59Z', 1, now), true);
});

test('isPostTooOld allows a post whose age cannot be known', () => {
	const now = new Date('2026-01-10T12:00:00Z');
	assert.equal(isPostTooOld(null, 2, now), false);
	assert.equal(isPostTooOld(undefined, 2, now), false);
	assert.equal(isPostTooOld('', 2, now), false);
	assert.equal(isPostTooOld('not a date', 2, now), false);
});

test('freezesAfterPost banks one per two posted days, capped at three', () => {
	assert.equal(freezesAfterPost(0, 1), 0);
	assert.equal(freezesAfterPost(0, 2), 1);
	assert.equal(freezesAfterPost(1, 3), 1);
	assert.equal(freezesAfterPost(3, 10), 3);
});

test('freezesAfterPost does not refund a spent freeze', () => {
	assert.equal(freezesAfterPost(2, 7), 2);
});

test('settleMissedDays spends a freeze per missed day', () => {
	assert.deepEqual(settleMissedDays({ lastDay: '2026-01-01', freezes: 2, streak: 5 }, '2026-01-03'), {
		days: [
			{ date: '2026-01-02', status: 'frozen' },
			{ date: '2026-01-03', status: 'frozen' }
		],
		freezes: 0,
		streak: 7,
		broke: false
	});
});

test('settleMissedDays breaks the streak when freezes run out', () => {
	assert.deepEqual(settleMissedDays({ lastDay: '2026-01-01', freezes: 1, streak: 5 }, '2026-01-04'), {
		days: [
			{ date: '2026-01-02', status: 'frozen' },
			{ date: '2026-01-03', status: 'missed' }
		],
		freezes: 0,
		streak: 0,
		broke: true
	});
});

test('settleMissedDays does nothing when no day was missed', () => {
	assert.deepEqual(settleMissedDays({ lastDay: '2026-01-03', freezes: 1, streak: 5 }, '2026-01-03'), {
		days: [],
		freezes: 1,
		streak: 5,
		broke: false
	});
});

test('nextMilestone fires once per threshold crossed', () => {
	assert.equal(nextMilestone(2, null), 2);
	assert.equal(nextMilestone(2, 2), null);
	assert.equal(nextMilestone(10, 7), null);
	assert.equal(nextMilestone(15, 7), 15);
});
