import { TABLES, F, PARTICIPANT_HAS_SLACK_ID } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';

export async function load() {
	const [submissions, participants] = await Promise.all([
		airtable.list(TABLES.submissions),
		airtable.list(TABLES.participants, { filterByFormula: PARTICIPANT_HAS_SLACK_ID })
	]);

	const nameBySlackId = new Map(
		participants.map((p) => [p.fields[F.participants.slackId], p.fields[F.participants.name]])
	);

	const videos = submissions
		.map((s) => ({
			slackId: s.fields[F.submissions.slackId],
			name: nameBySlackId.get(s.fields[F.submissions.slackId]) ?? 'Unknown',
			url: s.fields[F.submissions.url],
			platform: s.fields[F.submissions.platform],
			views: s.fields[F.submissions.views] ?? 0,
			likes: s.fields[F.submissions.likes] ?? 0
		}))
		.sort((a, b) => b.views - a.views)
		.slice(0, 25);

	return { videos };
}
