import { isAdmin, TABLES, F } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';

export async function load({ locals }) {
	const submissions = await airtable.list(TABLES.submissions);
	const tracked = submissions.filter((s) => s.fields[F.submissions.unifiedId]).length;

	return {
		session: locals.session,
		isAdmin: !!locals.session && isAdmin(locals.session.slackId),
		videosPosted: submissions.length,
		videosTracked: tracked
	};
}
