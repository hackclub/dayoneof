import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config.js';
import { runReconcile } from '$lib/server/jobs.js';

export async function GET({ request }) {
	if (request.headers.get('authorization') !== `Bearer ${config.cronSecret}`) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const result = await runReconcile();
	return json({ ok: true, ...result });
}
