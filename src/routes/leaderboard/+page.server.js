import { TABLES, F, PARTICIPANT_HAS_SLACK_ID } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';

export async function load() {
	const [participants, submissions] = await Promise.all([
		airtable.list(TABLES.participants, { filterByFormula: PARTICIPANT_HAS_SLACK_ID }),
		airtable.list(TABLES.submissions)
	]);

	const nameBySlackId = new Map(
		participants.map((p) => [p.fields[F.participants.slackId], p.fields[F.participants.name]])
	);

	const byStreak = [...participants]
		.sort((a, b) => (b.fields[F.participants.currentStreak] ?? 0) - (a.fields[F.participants.currentStreak] ?? 0))
		.map((p) => ({
			slackId: p.fields[F.participants.slackId],
			name: p.fields[F.participants.name],
			streak: p.fields[F.participants.currentStreak] ?? 0,
			freezes: p.fields[F.participants.streakFreezes] ?? 0
		}));

	const byViews = [...participants]
		.sort((a, b) => (b.fields[F.participants.totalViews] ?? 0) - (a.fields[F.participants.totalViews] ?? 0))
		.map((p) => ({
			slackId: p.fields[F.participants.slackId],
			name: p.fields[F.participants.name],
			views: p.fields[F.participants.totalViews] ?? 0
		}));

	const byVideo = submissions
		.map((s) => ({
			slackId: s.fields[F.submissions.slackId],
			name: nameBySlackId.get(s.fields[F.submissions.slackId]) ?? 'Unknown',
			url: s.fields[F.submissions.url],
			title: s.fields[F.submissions.title] || s.fields[F.submissions.platform],
			views: s.fields[F.submissions.views] ?? 0
		}))
		.sort((a, b) => b.views - a.views)
		.slice(0, 10);

	return { byStreak, byViews, byVideo };
}
