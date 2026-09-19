import { error } from '@sveltejs/kit';
import { TABLES, F } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';

export async function load({ params }) {
	const participant = await airtable.find(
		TABLES.participants,
		`{${F.participants.slackId}} = "${params.slackId}"`
	);
	if (!participant) error(404, 'no participant with that Slack ID');

	const submissions = await airtable.list(TABLES.submissions, {
		filterByFormula: `{${F.submissions.slackId}} = "${params.slackId}"`,
		sort: [{ field: F.submissions.postedAt, direction: 'desc' }]
	});

	return {
		name: participant.fields[F.participants.name],
		slackId: params.slackId,
		currentStreak: participant.fields[F.participants.currentStreak] ?? 0,
		streakFreezes: participant.fields[F.participants.streakFreezes] ?? 0,
		totalViews: participant.fields[F.participants.totalViews] ?? 0,
		videosPosted: submissions.length,
		videosTracked: submissions.filter((s) => s.fields[F.submissions.unifiedId]).length,
		submissions: submissions.map((s) => ({
			url: s.fields[F.submissions.url],
			platform: s.fields[F.submissions.platform],
			postedAt: s.fields[F.submissions.postedAt],
			views: s.fields[F.submissions.views] ?? 0,
			likes: s.fields[F.submissions.likes] ?? 0,
			countedTowardStreak: !!s.fields[F.submissions.countedTowardStreak]
		}))
	};
}
