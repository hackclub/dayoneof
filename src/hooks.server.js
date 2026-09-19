import { getSession } from '$lib/server/session.js';

export async function handle({ event, resolve }) {
	event.locals.session = getSession(event.cookies);
	return resolve(event);
}
