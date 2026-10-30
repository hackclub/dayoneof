// One-off backfill: invites every signed-up participant to #dayoneof, #dayoneof-submissions and
// #dayoneof-help. Sign-in only ever invited people to submissions, so most are missing the rest.
//
//   node --env-file=.env scripts/invite_participants.js            # print who is missing
//   node --env-file=.env scripts/invite_participants.js --apply    # invite them
//
// The bot has to already be in each channel — it has no channels:join scope.

import { tablesFor, PARTICIPANT_HAS_SLACK_ID, F } from '../src/lib/server/schema.js';
import { HELP_CHANNEL_ID } from '../src/lib/help.js';

const API = 'https://api.airtable.com/v0';
const INVITE_BATCH = 100;

/** @type {'dev' | 'prod'} */
const appEnv = process.env.APP_ENV?.trim().toLowerCase() === 'prod' ? 'prod' : 'dev';
const apply = process.argv.includes('--apply');

/**
 * Mirrors config.js: NAME_DEV / NAME_PROD wins, unsuffixed name is the shared fallback.
 * @param {string} name
 */
function envVar(name) {
	const value = process.env[`${name}_${appEnv.toUpperCase()}`] || process.env[name];
	if (!value) throw new Error(`missing required env var: ${name} (APP_ENV=${appEnv})`);
	return value;
}

const slackToken = envVar('SLACK_BOT_TOKEN');

/**
 * @param {string} method
 * @param {Record<string, string>} params
 * @returns {Promise<any>}
 */
async function slack(method, params) {
	const res = await fetch(`https://slack.com/api/${method}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${slackToken}`,
			'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'
		},
		body: new URLSearchParams(params)
	});
	if (res.status === 429) {
		await new Promise((resolve) => setTimeout(resolve, (Number(res.headers.get('retry-after')) || 1) * 1000));
		return slack(method, params);
	}
	const data = await res.json();
	if (!data.ok) throw new Error(`slack ${method} failed: ${data.error} ${JSON.stringify(data.errors ?? '')}`);
	return data;
}

/** @param {string} channel */
async function channelMembers(channel) {
	/** @type {Set<string>} */
	const members = new Set();
	let cursor = '';
	do {
		const page = await slack('conversations.members', { channel, limit: '1000', cursor });
		for (const id of page.members) members.add(id);
		cursor = page.response_metadata?.next_cursor ?? '';
	} while (cursor);
	return members;
}

async function participantSlackIds() {
	const token = envVar('AIRTABLE_TOKEN');
	const baseId = envVar('AIRTABLE_BASE_ID');
	const table = tablesFor(appEnv).participants;
	/** @type {Set<string>} */
	const ids = new Set();
	let offset;
	do {
		const params = new URLSearchParams({ pageSize: '100', filterByFormula: PARTICIPANT_HAS_SLACK_ID });
		params.append('fields[]', F.participants.slackId);
		if (offset) params.set('offset', offset);
		const res = await fetch(`${API}/${baseId}/${encodeURIComponent(table)}?${params}`, {
			headers: { Authorization: `Bearer ${token}` }
		});
		if (!res.ok) throw new Error(`airtable GET ${table} failed: ${res.status} ${await res.text()}`);
		const page = await res.json();
		for (const record of page.records) ids.add(record.fields[F.participants.slackId]);
		offset = page.offset;
	} while (offset);
	return ids;
}

const channels = [
	envVar('SLACK_ANNOUNCE_CHANNEL_ID'),
	envVar('SLACK_SUBMISSION_CHANNEL_ID'),
	...(appEnv === 'prod' ? [HELP_CHANNEL_ID] : [])
];

const participants = await participantSlackIds();
console.log(`${participants.size} participants (APP_ENV=${appEnv})`);

for (const channel of channels) {
	const { channel: info } = await slack('conversations.info', { channel });
	const members = await channelMembers(channel);
	const missing = [...participants].filter((id) => !members.has(id));
	console.log(`#${info.name}: ${members.size} members, ${missing.length} participants missing`);
	if (!apply || !missing.length) continue;
	if (!info.is_member) {
		console.error(`  skipped: the bot isn't in #${info.name}, invite it first`);
		continue;
	}

	for (let i = 0; i < missing.length; i += INVITE_BATCH) {
		const batch = missing.slice(i, i + INVITE_BATCH);
		// force skips the users Slack refuses (guests, deactivated) instead of failing the batch.
		const result = await slack('conversations.invite', { channel, users: batch.join(','), force: 'true' })
			.then((data) => (data.errors?.length ? `ok, ${data.errors.length} refused` : 'ok'))
			.catch((err) => err.message);
		console.log(`  invited ${i + 1}-${i + batch.length}: ${result}`);
	}
}

if (!apply) console.log('dry run, pass --apply to invite');
