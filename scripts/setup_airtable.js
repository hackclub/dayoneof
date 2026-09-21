// Creates (or tops up) the four tables this app needs in an Airtable base, so standing up a second
// base for testing is one command instead of a couple dozen clicks. Safe to re-run: existing
// tables and fields are left alone, only missing ones are added.
//
//   node --env-file=.env scripts/setup_airtable.js dev
//   node --env-file=.env scripts/setup_airtable.js prod
//
// Needs a token with schema.bases:write on top of the data scopes the app itself uses.

import { tablesFor, F, DAY_STATUSES, PARTICIPANT_STATUSES } from '../src/lib/server/schema.js';

const META = 'https://api.airtable.com/v0/meta/bases';

const text = { type: 'singleLineText' };
const longText = { type: 'multilineText' };
const int = { type: 'number', options: { precision: 0 } };
const check = { type: 'checkbox', options: { icon: 'check', color: 'greenBright' } };
const when = {
	type: 'dateTime',
	options: { timeZone: 'utc', dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' } }
};
/** @param {string[]} names */
const select = (names) => ({
	type: 'singleSelect',
	options: { choices: names.map((name) => ({ name })) }
});

// First field of each table is its primary field.
/** @param {'dev' | 'prod'} appEnv */
function schemaFor(appEnv) {
	const TABLES = tablesFor(appEnv);
	return [
		{
			name: TABLES.participants,
			fields: [
				{ name: F.participants.slackId, ...text },
				{ name: F.participants.name, ...text },
				{ name: F.participants.email, type: 'email' },
				{ name: F.participants.tz, ...text },
				{ name: F.participants.status, ...select(PARTICIPANT_STATUSES) },
				{ name: F.participants.verificationStatus, ...text },
				{ name: F.participants.daysCompleted, ...int },
				{ name: F.participants.streakFreezes, ...int },
				{ name: F.participants.currentStreak, ...int },
				{ name: F.participants.lastMilestone, ...int },
				{ name: F.participants.reminderHour, ...int },
				{ name: F.participants.lastReminderDay, ...text },
				{ name: F.participants.totalViews, ...int }
			]
		},
		{
			name: TABLES.days,
			fields: [
				{ name: F.days.slackId, ...text },
				{ name: F.days.date, ...text },
				{ name: F.days.status, ...select(DAY_STATUSES) }
			]
		},
		{
			name: TABLES.submissions,
			fields: [
				{ name: F.submissions.submissionId, type: 'autoNumber' },
				{ name: F.submissions.slackId, ...text },
				{ name: F.submissions.url, ...text },
				{ name: F.submissions.platform, ...text },
				{ name: F.submissions.videoId, ...text },
				{ name: F.submissions.postedAt, ...when },
				{ name: F.submissions.day, ...text },
				{ name: F.submissions.countedTowardStreak, ...check },
				{ name: F.submissions.channelId, ...text },
				{ name: F.submissions.messageTs, ...text },
				{ name: F.submissions.reviewCount, ...int },
				{ name: F.submissions.views, ...int },
				{ name: F.submissions.title, ...text },
				{ name: F.submissions.unifiedId, ...text },
				{ name: F.submissions.replyMessageTs, ...text },
				{ name: F.submissions.streakAtPost, ...int },
				{ name: F.submissions.freezesAtPost, ...int }
			]
		},
		{
			name: TABLES.reviews,
			fields: [
				{ name: F.reviews.reviewId, type: 'autoNumber' },
				{ name: F.reviews.submissionId, ...text },
				{ name: F.reviews.reviewerId, ...text },
				{ name: F.reviews.reviewedAt, ...when },
				{ name: F.reviews.messageTs, ...text },
				{ name: F.reviews.length, ...int },
				{ name: F.reviews.text, ...longText }
			]
		}
	];
}

/**
 * Mirrors config.js: NAME_DEV / NAME_PROD wins, unsuffixed name is the shared fallback.
 * @param {string} name
 * @param {'dev' | 'prod'} appEnv
 */
function envVar(name, appEnv) {
	const value = process.env[`${name}_${appEnv.toUpperCase()}`] || process.env[name];
	if (!value) throw new Error(`missing required env var: ${name} (APP_ENV=${appEnv})`);
	return value;
}

/**
 * @param {string} token
 * @param {string} url
 * @param {RequestInit} [init]
 */
async function api(token, url, init) {
	const res = await fetch(url, {
		...init,
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
	});
	const body = await res.text();
	if (!res.ok) throw new Error(`airtable ${init?.method ?? 'GET'} ${url} failed: ${res.status} ${body}`);
	return JSON.parse(body);
}

async function main() {
	const arg = (process.argv[2] ?? process.env.APP_ENV ?? 'dev').trim().toLowerCase();
	if (arg !== 'dev' && arg !== 'prod') throw new Error(`usage: setup_airtable.js [dev|prod]`);
	const appEnv = /** @type {'dev' | 'prod'} */ (arg);

	const token = envVar('AIRTABLE_TOKEN', appEnv);
	const baseId = envVar('AIRTABLE_BASE_ID', appEnv);
	console.log(`setting up ${appEnv} tables in base ${baseId}`);

	const { tables: existing } = await api(token, `${META}/${baseId}/tables`);

	for (const table of schemaFor(appEnv)) {
		const found = existing.find(/** @param {{ name: string }} t */ (t) => t.name === table.name);
		if (!found) {
			await api(token, `${META}/${baseId}/tables`, {
				method: 'POST',
				body: JSON.stringify(table)
			});
			console.log(`  created ${table.name} (${table.fields.length} fields)`);
			continue;
		}

		const have = new Set(
			found.fields.map(/** @param {{ name: string }} f */ (f) => f.name)
		);
		const missing = table.fields.filter((f) => !have.has(f.name));
		for (const field of missing) {
			await api(token, `${META}/${baseId}/tables/${found.id}/fields`, {
				method: 'POST',
				body: JSON.stringify(field)
			});
		}
		console.log(
			missing.length
				? `  ${table.name} existed, added ${missing.map((f) => f.name).join(', ')}`
				: `  ${table.name} already up to date`
		);
	}

	console.log('done');
}

main().catch((err) => {
	const message = String(err.message);
	console.error(message);
	if (message.includes('INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND')) {
		console.error(
			'\nhint: Airtable returns this for both "no access" and "not found", so check all three at\n' +
				'https://airtable.com/create/tokens — the token needs the schema.bases:read AND\n' +
				'schema.bases:write scopes (read is separate; write does not imply it), plus this base\n' +
				'listed under its access, and the base id has to match.'
		);
	}
	if (message.includes('PRIMARY_FIELD')) {
		console.error(
			'hint: if Airtable rejects an autoNumber primary field, create that table by hand with ' +
				'submission_id / review_id as an Autonumber primary field, then re-run to add the rest.'
		);
	}
	// Not process.exit(): exiting from inside a rejection handler while fetch's handles are still
	// closing trips a libuv assertion on Windows.
	process.exitCode = 1;
});
