import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config, isAdmin } from '$lib/server/config.js';
import { BACKUP_FILE } from '$lib/server/jobs.js';

export async function GET({ params, locals }) {
	if (!locals.session || !isAdmin(locals.session.slackId)) error(403, "You're not an admin.");
	if (!BACKUP_FILE.test(params.file)) error(404, 'No such backup.');

	const body = await readFile(path.join(config.backupDir, params.file)).catch(() => null);
	if (!body) error(404, 'No such backup.');
	return new Response(body, {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${params.file}"`
		}
	});
}
