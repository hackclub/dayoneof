import { json } from '@sveltejs/kit';
import { isCronAuthorized } from '$lib/server/cron.js';
import { runReconcile } from '$lib/server/jobs.js';

export async function GET({ request }) {
	if (!isCronAuthorized(request)) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const result = await runReconcile();
	return json({ ok: true, ...result });
}
