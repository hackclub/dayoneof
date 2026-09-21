import { getSession } from '$lib/server/session.js';

export async function handle({ event, resolve }) {
	event.locals.session = getSession(event.cookies);
	return resolve(event);
}

// Only fires for unexpected throws, not for `error(...)` — those keep their own message. The real
// error is logged rather than returned: Airtable failures carry the request URL and response body.
/** @type {import('@sveltejs/kit').HandleServerError} */
export function handleError({ error, event }) {
	console.error('unhandled error', event.route.id, error);
	return { message: "We couldn't load that right now. Try again in a minute!" };
}
