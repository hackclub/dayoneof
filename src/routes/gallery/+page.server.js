import { TABLES, F } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';

export async function load() {
	const [submissions, participants] = await Promise.all([
		airtable.list(TABLES.submissions, {
			sort: [{ field: F.submissions.postedAt, direction: 'desc' }]
		}),
		airtable.list(TABLES.participants)
	]);

	const nameBySlackId = new Map(
		participants.map((p) => [p.fields[F.participants.slackId], p.fields[F.participants.name]])
	);

	const items = submissions.map((s) => ({
		name: nameBySlackId.get(s.fields[F.submissions.slackId]) ?? 'Unknown',
		url: s.fields[F.submissions.url],
		platform: s.fields[F.submissions.platform],
		postedAt: s.fields[F.submissions.postedAt],
		views: s.fields[F.submissions.views] ?? 0
	}));

	return { items };
}
