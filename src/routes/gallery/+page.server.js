import { TABLES, F, PARTICIPANT_HAS_SLACK_ID } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';

export async function load({ url }) {
	const sort = url.searchParams.get('sort') === 'views' ? 'views' : 'date';

	const [submissions, participants] = await Promise.all([
		airtable.list(TABLES.submissions, {
			sort: [{ field: F.submissions.postedAt, direction: 'desc' }]
		}),
		airtable.list(TABLES.participants, { filterByFormula: PARTICIPANT_HAS_SLACK_ID })
	]);

	const nameBySlackId = new Map(
		participants.map((p) => [p.fields[F.participants.slackId], p.fields[F.participants.name]])
	);

	let items = submissions.map((s) => ({
		slackId: s.fields[F.submissions.slackId],
		name: nameBySlackId.get(s.fields[F.submissions.slackId]) ?? 'Unknown',
		url: s.fields[F.submissions.url],
		platform: s.fields[F.submissions.platform],
		postedAt: s.fields[F.submissions.postedAt],
		views: s.fields[F.submissions.views] ?? 0
	}));

	if (sort === 'views') items = [...items].sort((a, b) => b.views - a.views);

	return { items, sort };
}
