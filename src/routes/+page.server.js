import { isAdmin, TABLES } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';

export async function load({ locals }) {
	const submissions = await airtable.list(TABLES.submissions);

	return {
		session: locals.session,
		isAdmin: !!locals.session && isAdmin(locals.session.slackId),
		videosPosted: submissions.length
	};
}
