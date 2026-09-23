import { env } from '$env/dynamic/private';
// PUBLIC_SITE_URL needs the public env module — $env/dynamic/private excludes PUBLIC_-prefixed vars.
import { env as publicEnv } from '$env/dynamic/public';

import { tablesFor } from './schema.js';

export { F, PARTICIPANT_HAS_SLACK_ID } from './schema.js';

/** @type {'dev' | 'prod'} */
export const appEnv = env.APP_ENV?.trim().toLowerCase() === 'prod' ? 'prod' : 'dev';

// One base, two sets of tables — dev reads and writes the `_dev` copies.
export const TABLES = tablesFor(appEnv);

/**
 * Every var may be suffixed `_DEV`/`_PROD` so the test and production Airtable base, Slack app and
 * site URL can sit side by side in one file; the unsuffixed name is the shared fallback for the
 * ones that don't differ between the two. Defaults to dev, so a missing APP_ENV never picks prod.
 * @param {Record<string, string | undefined>} source
 * @param {string} name
 * @returns {string | undefined}
 */
function envVar(source, name) {
	return source[`${name}_${appEnv.toUpperCase()}`] || source[name];
}

/** @param {string} name */
const priv = (name) => envVar(env, name);

/** @param {string} name */
const pub = (name) => envVar(publicEnv, name);

export const config = {
	// Trailing slash stripped — every use appends a rooted path, and `.dev//api/auth/callback`
	// doesn't match the redirect URI registered with HCA.
	siteUrl: pub('PUBLIC_SITE_URL')?.replace(/\/$/, ''),
	// Blank switches tracking off entirely. Dev leaves it blank on purpose: a Funnel host is not
	// localhost, so count.js would report local browsing straight into the real site's numbers.
	goatcounterUrl: pub('PUBLIC_GOATCOUNTER_URL')?.replace(/\/$/, ''),
	airtableToken: priv('AIRTABLE_TOKEN'),
	airtableBaseId: priv('AIRTABLE_BASE_ID'),
	slackBotToken: priv('SLACK_BOT_TOKEN'),
	slackSigningSecret: priv('SLACK_SIGNING_SECRET'),
	submissionChannelId: priv('SLACK_SUBMISSION_CHANNEL_ID'),
	announceChannelId: priv('SLACK_ANNOUNCE_CHANNEL_ID'),
	hcaIssuer: (priv('HCA_ISSUER') || 'https://auth.hackclub.com').replace(/\/$/, ''),
	hcaClientId: priv('HCA_CLIENT_ID'),
	hcaClientSecret: priv('HCA_CLIENT_SECRET'),
	hcaScope: priv('HCA_SCOPE') || 'openid email name slack_id verification_status',
	sessionSecret: priv('SESSION_SECRET'),
	cronSecret: priv('CRON_SECRET'),
	unifiedSocialsToken: priv('UNIFIED_SOCIALS_TOKEN'),
	unifiedSocialsApiUrl:
		priv('UNIFIED_SOCIALS_API_URL') || 'https://unified-socials-db.hackclub.com/api/v1',
	// Opt-in because submitting a post to unified-socials-db starts paid work. Off in both
	// environments until it is set to exactly "true" — see trackPost in unified.js.
	unifiedSocialsTrackPosts: priv('UNIFIED_SOCIALS_TRACK_POSTS') === 'true',
	// Falls back on anything unparseable rather than passing NaN on: every age comparison against
	// NaN is false, which would let any old video through.
	maxPostAgeDays: Number(priv('MAX_POST_AGE_DAYS')) || 2,
	adminSlackIds: (priv('ADMIN_SLACK_IDS') ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean)
};

/** @param {string | undefined} slackId */
export function isAdmin(slackId) {
	return !!slackId && config.adminSlackIds.includes(slackId);
}

/**
 * @param {string} name
 * @param {string | undefined} value
 * @returns {string}
 */
export function requireEnv(name, value) {
	if (!value) throw new Error(`missing required env var: ${name} (APP_ENV=${appEnv})`);
	return value;
}
