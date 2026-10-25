import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRepeats, screenplayOverlap } from '../src/lib/server/repeats.js';

/**
 * @param {string} id
 * @param {Record<string, any>} fields
 */
const row = (id, fields) => ({ id, fields: { slack_id: 'U1', ...fields } });

const SHOW = '[00:00] A robot rolls across a desk while a student solders a glowing badge at Hack Club.';
const OTHER = '[00:00] Someone cooks pasta in a small kitchen and talks about their weekend plans.';

test('screenplayOverlap scores one video far above a different one', () => {
	assert.ok(screenplayOverlap(SHOW, `${SHOW} The robot beeps.`) > 0.5);
	assert.ok(screenplayOverlap(SHOW, OTHER) < 0.15);
});

test('flags a later upload of the same video and skips its own other platforms', async () => {
	const rows = [
		row('recA', { day: '2026-10-20', platform: 'youtube', duration_seconds: 30, unified_id: '1', title: 'robots' }),
		row('recB', { day: '2026-10-20', platform: 'tiktok', duration_seconds: 30.2, unified_id: '2', primary_submission: 'recA' }),
		row('recC', { day: '2026-10-22', platform: 'instagram', duration_seconds: 31, unified_id: '3', title: 'new caption' }),
		row('recD', { day: '2026-10-22', platform: 'tiktok', duration_seconds: 31, unified_id: '4' }),
		row('recE', { day: '2026-10-23', platform: 'youtube', duration_seconds: 45, title: '#hackclub #coding #tech' }),
		row('recF', { day: '2026-10-24', platform: 'tiktok', duration_seconds: 20, title: '#hackclub #coding #tech' })
	];
	/** @type {Record<string, string>} */
	const screenplays = { 1: SHOW, 2: SHOW, 3: `${SHOW} It beeps.`, 4: OTHER };
	const repeats = await findRepeats(rows, '2026-10-24', async (id) => screenplays[id] ?? null);
	assert.deepEqual([...repeats.keys()], ['recC']);
	assert.equal(repeats.get('recC')?.of.id, 'recA');
});
