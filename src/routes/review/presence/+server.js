import { error, json } from '@sveltejs/kit';
import { isReviewer } from '$lib/server/config.js';
import { view, snapshot } from '$lib/server/presence.js';

export async function POST({ request, locals }) {
	const reviewer = locals.session?.slackId;
	if (!reviewer || !isReviewer(reviewer)) error(403, "You're not a reviewer.");
	const { id, drafting } = await request.json().catch(() => ({}));
	view(reviewer, typeof id === 'string' ? id : '', drafting === true);
	return json(snapshot());
}
