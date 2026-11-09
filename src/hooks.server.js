import { text } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { getSession } from '$lib/server/session.js';

const FORM_CONTENT_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];

/** @param {Request} request */
function isFormRequest(request) {
	const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
	return request.method !== 'GET' && request.method !== 'HEAD' && FORM_CONTENT_TYPES.includes(type);
}

export async function handle({ event, resolve }) {
	// Slack requests are verified by signature in their own handlers instead
	if (
		!dev &&
		!event.url.pathname.startsWith('/api/slack/') &&
		isFormRequest(event.request) &&
		event.request.headers.get('origin') !== event.url.origin
	) {
		return text(`Cross-site ${event.request.method} form submissions are forbidden`, { status: 403 });
	}
	event.locals.session = getSession(event.cookies);
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
