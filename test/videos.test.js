import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByVideo, combineStats, videoPlatforms } from '../src/lib/server/videos.js';

/**
 * @param {string} id
 * @param {Record<string, any>} fields
 */
const row = (id, fields) => ({ id, fields });

test('groups other platforms under their video and sums their views', () => {
	const groups = groupByVideo([
		row('recA', { platform: 'youtube', views: 10 }),
		row('recB', { platform: 'tiktok', views: 50, primary_submission: 'recA' }),
		row('recC', { platform: 'instagram', views: 5 }),
		row('recD', { platform: 'tiktok', views: 7, primary_submission: 'recGone' })
	]);
	assert.deepEqual(
		groups.map((g) => [g.primary.id, g.rows.map((r) => r.id), g.views]),
		[
			['recA', ['recA', 'recB'], 60],
			['recC', ['recC'], 5]
		]
	);
	assert.equal(videoPlatforms(groups[0].rows)[0].platform, 'tiktok');
});

test('combineStats keeps unknown counters unknown', () => {
	const base = { views: 1, likes: 2, shares: null, watchHours: null, watchHoursEstimated: false };
	assert.deepEqual(combineStats([base, { ...base, shares: 3, watchHours: 1.5, watchHoursEstimated: true }]), {
		views: 2,
		likes: 4,
		shares: 3,
		watchHours: 1.5,
		watchHoursEstimated: true
	});
	assert.equal(combineStats([]), null);
});
