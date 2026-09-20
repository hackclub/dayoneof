import { redirect } from '@sveltejs/kit';
import { TABLES, F, PARTICIPANT_HAS_SLACK_ID } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';

export async function load({ locals }) {
	if (locals.session) redirect(302, '/home');

	const [submissions, participants] = await Promise.all([
		airtable.list(TABLES.submissions),
		airtable.list(TABLES.participants, { filterByFormula: PARTICIPANT_HAS_SLACK_ID })
	]);

	const views = submissions.map((s) => s.fields[F.submissions.views] ?? 0);

	return {
		totalViews: views.reduce((sum, v) => sum + v, 0),
		mostViewedVideo: views.reduce((max, v) => Math.max(max, v), 0),
		participants: participants.length
	};
}
