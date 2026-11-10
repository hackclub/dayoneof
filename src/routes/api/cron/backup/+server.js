import { json } from '@sveltejs/kit';
import { isCronAuthorized } from '$lib/server/cron.js';
import { runBackup } from '$lib/server/jobs.js';
import { runStatsSnapshot } from '$lib/server/stats.js';

export async function GET({ request }) {
	if (!isCronAuthorized(request)) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const result = await runBackup();
	// After the backup, so a missing earlier day can be filled from it.
	const stats = await runStatsSnapshot().catch((err) => {
		console.error('stats snapshot failed', err);
		return { error: err instanceof Error ? err.message : String(err) };
	});
	return json({ ok: true, ...result, stats });
}
