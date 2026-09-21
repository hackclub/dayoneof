import { timingSafeEqual } from 'node:crypto';
import { config, requireEnv } from './config.js';

// requireEnv rather than a plain compare: with CRON_SECRET unset, `Bearer undefined` would
// otherwise be a valid credential for every job endpoint.
/** @param {Request} request */
export function isCronAuthorized(request) {
	const expected = Buffer.from(`Bearer ${requireEnv('CRON_SECRET', config.cronSecret)}`);
	const given = Buffer.from(request.headers.get('authorization') ?? '');
	return given.length === expected.length && timingSafeEqual(given, expected);
}
