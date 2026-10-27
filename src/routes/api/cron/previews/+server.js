import { json } from '@sveltejs/kit';
import { isCronAuthorized } from '$lib/server/cron.js';
import { runPreviews } from '$lib/server/jobs.js';
import { runPending } from '$lib/server/pending.js';

export async function GET({ request }) {
	if (!isCronAuthorized(request)) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const pending = await runPending();
	const result = await runPreviews();
	return json({ ok: true, ...result, pending });
}
