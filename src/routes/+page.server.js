import { redirect } from '@sveltejs/kit';
import { config, TABLES, F, PARTICIPANT_HAS_SLACK_ID } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';

const LEADERBOARD_SIZE = 8;

/** @param {unknown} value */
function count(value) {
	return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export async function load({ locals }) {
	if (locals.session) redirect(302, '/home');

	const [submissions, participants] = await Promise.all([
		airtable.listCached(TABLES.submissions, {
			sort: [{ field: F.submissions.postedAt, direction: 'desc' }]
		}),
		airtable.listCached(TABLES.participants, { filterByFormula: PARTICIPANT_HAS_SLACK_ID })
	]);

	const views = submissions.map((s) => s.fields[F.submissions.views] ?? 0);

	const leaderboard = [...participants]
		.sort(
			(a, b) =>
				count(b.fields[F.participants.currentStreak]) - count(a.fields[F.participants.currentStreak])
		)
		.slice(0, LEADERBOARD_SIZE)
		.map((p) => ({
			slackId: p.fields[F.participants.slackId],
			name: p.fields[F.participants.name] || 'Unknown',
			streak: count(p.fields[F.participants.currentStreak])
		}));

	return {
		totalViews: views.reduce((sum, v) => sum + v, 0),
		mostViewedVideo: views.reduce((max, v) => Math.max(max, v), 0),
		participants: participants.length,
		submissionsOpen: config.submissionsOpen,
		leaderboard
	};
}
