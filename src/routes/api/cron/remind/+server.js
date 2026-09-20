import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config.js';
import { runRemind } from '$lib/server/jobs.js';

export async function GET({ request }) {
	if (request.headers.get('authorization') !== `Bearer ${config.cronSecret}`) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const result = await runRemind();
	return json({ ok: true, ...result });
}
