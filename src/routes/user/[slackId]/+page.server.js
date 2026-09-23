import { error } from '@sveltejs/kit';
import { TABLES, F, PARTICIPANT_HAS_SLACK_ID } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';

export async function load({ params, locals }) {
	const [participants, allSubmissions] = await Promise.all([
		airtable.listCached(TABLES.participants, { filterByFormula: PARTICIPANT_HAS_SLACK_ID }),
		airtable.listCached(TABLES.submissions, {
			sort: [{ field: F.submissions.postedAt, direction: 'desc' }]
		})
	]);

	const participant = participants.find(
		(p) => p.fields[F.participants.slackId] === params.slackId
	);
	if (!participant) error(404, "Nobody's signed up with that Slack ID.");

	const submissions = allSubmissions.filter(
		(s) => s.fields[F.submissions.slackId] === params.slackId
	);

	return {
		session: locals.session,
		name: participant.fields[F.participants.name],
		slackId: params.slackId,
		avatar: participant.fields[F.participants.avatar] || '',
		currentStreak: participant.fields[F.participants.currentStreak] ?? 0,
		streakFreezes: participant.fields[F.participants.streakFreezes] ?? 0,
		totalViews: participant.fields[F.participants.totalViews] ?? 0,
		videosPosted: submissions.length,
		videos: submissions.map((s) => ({
			url: s.fields[F.submissions.url],
			platform: s.fields[F.submissions.platform],
			title: s.fields[F.submissions.title] || '',
			thumbnail: s.fields[F.submissions.thumbnailUrl] || '',
			postedAt: s.fields[F.submissions.postedAt],
			views: s.fields[F.submissions.views] ?? 0,
			countedTowardStreak: !!s.fields[F.submissions.countedTowardStreak]
		}))
	};
}
