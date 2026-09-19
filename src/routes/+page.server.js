import { isAdmin } from '$lib/server/config.js';

export function load({ locals }) {
	return {
		session: locals.session,
		isAdmin: !!locals.session && isAdmin(locals.session.slackId)
	};
}
