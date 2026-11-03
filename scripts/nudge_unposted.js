// One-off nudge: DMs every signed-up participant who hasn't submitted a single video yet.
// Skips anyone with reminders off, and anyone already in the sent log so a rerun can't double-DM.
//
//   node --env-file=.env scripts/nudge_unposted.js                 # print who would get it
//   node --env-file=.env scripts/nudge_unposted.js --to U0123ABC   # send only to one user (test)
//   node --env-file=.env scripts/nudge_unposted.js --apply         # send to everyone
//
// Two messages: the reel as an image block (Instagram unfurls are unreliable), then the rest
// with unfurling off so the shoutout links stay plain.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tablesFor, PARTICIPANT_HAS_SLACK_ID, SUBMISSION_NOT_DELETED, F } from '../src/lib/server/schema.js';
import { HELP_CHANNEL_ID } from '../src/lib/help.js';

const API = 'https://api.airtable.com/v0';
const REEL_URL = 'https://www.instagram.com/reel/DfQG0eVhhuv/';
// Redirects to a freshly signed thumbnail; the og:image URLs expire after a few days.
const REEL_THUMB_URL = 'https://www.instagram.com/p/DfQG0eVhhuv/media/?size=l';
const SEND_DELAY_MS = 1200;

/** @type {'dev' | 'prod'} */
const appEnv = process.env.APP_ENV?.trim().toLowerCase() === 'prod' ? 'prod' : 'dev';
const apply = process.argv.includes('--apply');
const toIndex = process.argv.indexOf('--to');
const testUser = toIndex === -1 ? null : process.argv[toIndex + 1];

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
const submissionChannel = envVar('SLACK_SUBMISSION_CHANNEL_ID');
const siteUrl = envVar('PUBLIC_SITE_URL').replace(/\/$/, '');

const logDir = process.env.BACKUP_DIR || 'backups';
const logPath = join(logDir, `nudge_unposted_${appEnv}.log`);

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
		await sleep((Number(res.headers.get('retry-after')) || 1) * 1000);
		return slack(method, params);
	}
	const data = await res.json();
	if (!data.ok) throw new Error(`slack ${method} failed: ${data.error}`);
	return data;
}

/**
 * @param {string} table
 * @param {string} filterByFormula
 * @param {string[]} fields
 * @returns {Promise<Record<string, any>[]>}
 */
async function airtableRows(table, filterByFormula, fields) {
	const token = envVar('AIRTABLE_TOKEN');
	const baseId = envVar('AIRTABLE_BASE_ID');
	const rows = [];
	let offset;
	do {
		const params = new URLSearchParams({ pageSize: '100', filterByFormula });
		for (const field of fields) params.append('fields[]', field);
		if (offset) params.set('offset', offset);
		const res = await fetch(`${API}/${baseId}/${encodeURIComponent(table)}?${params}`, {
			headers: { Authorization: `Bearer ${token}` }
		});
		if (!res.ok) throw new Error(`airtable GET ${table} failed: ${res.status} ${await res.text()}`);
		const page = await res.json();
		for (const record of page.records) rows.push(record.fields);
		offset = page.offset;
	} while (offset);
	return rows;
}

async function unpostedSlackIds() {
	const tables = tablesFor(appEnv);
	const participants = await airtableRows(
		tables.participants,
		`AND(${PARTICIPANT_HAS_SLACK_ID}, NOT({${F.participants.remindersOff}}))`,
		[F.participants.slackId]
	);
	const submissions = await airtableRows(tables.submissions, SUBMISSION_NOT_DELETED, [F.submissions.slackId]);
	const posted = new Set(submissions.map((s) => s[F.submissions.slackId]));
	return participants.map((p) => p[F.participants.slackId]).filter((id) => !posted.has(id));
}

function sentLog() {
	if (!existsSync(logPath)) return new Set();
	return new Set(readFileSync(logPath, 'utf8').split('\n').filter(Boolean));
}

const SHOUTOUTS = [
	'https://www.instagram.com/reel/DfOWgW_iNUw/',
	'https://www.youtube.com/watch?v=_x1-gTdwZ7Q',
	'https://www.youtube.com/watch?v=quxUg0_tU-w'
];

const intro = `hey!! you signed up for day one of but haven't posted your first video yet. day one is the hardest part, so here's <${REEL_URL}|what you're getting into>`;

// danger is the only red Slack allows, the closest match to the site's accent.
const introBlocks = [
	{ type: 'section', text: { type: 'mrkdwn', text: intro } },
	{ type: 'image', image_url: REEL_THUMB_URL, alt_text: 'the day one of reel' },
	{
		type: 'actions',
		elements: [
			{ type: 'button', text: { type: 'plain_text', text: 'watch the reel' }, url: REEL_URL, style: 'danger' }
		]
	}
];

const body = `nobody starts out good at this. people who started on day one have already gotten way better, just look at <${SHOUTOUTS[0]}|this>, <${SHOUTOUTS[1]}|this> and <${SHOUTOUTS[2]}|this>!! you can <${siteUrl}/home?sort=starred|explore all the starred reels on the site> too.

it doesn't need to be polished. film whatever you're building, learning or up to today, put it on youtube shorts, tiktok or instagram, and drop the link in <#${submissionChannel}>.

post 2 days and you get stickers. a week gets you a t-shirt, then socks + a pin at 15 days and an orpheus plushie at 25. the most-viewed creator also gets a $500 fund

post today and you're on day one!! stuck on what to film? ask in <#${HELP_CHANNEL_ID}>.`;

/** @param {string} user */
async function send(user) {
	const { channel } = await slack('conversations.open', { users: user });
	await slack('chat.postMessage', {
		channel: channel.id,
		text: intro,
		blocks: JSON.stringify(introBlocks),
		unfurl_links: 'false',
		unfurl_media: 'false'
	});
	await slack('chat.postMessage', {
		channel: channel.id,
		text: body,
		unfurl_links: 'false',
		unfurl_media: 'false'
	});
}

console.log(`--- message ---\n${intro}\n\n${body}\n---------------`);

if (testUser) {
	await send(testUser);
	console.log(`sent test to ${testUser}`);
	process.exit(0);
}

const sent = sentLog();
const targets = (await unpostedSlackIds()).filter((id) => !sent.has(id));
console.log(`${targets.length} unposted participants to nudge (APP_ENV=${appEnv}, ${sent.size} already sent)`);

if (!apply) {
	console.log(targets.join('\n'));
	console.log('dry run, pass --apply to send');
	process.exit(0);
}

mkdirSync(logDir, { recursive: true });
let failed = 0;
for (const [i, user] of targets.entries()) {
	try {
		await send(user);
		appendFileSync(logPath, `${user}\n`);
		console.log(`  ${i + 1}/${targets.length} ${user}: ok`);
	} catch (err) {
		failed++;
		console.log(`  ${i + 1}/${targets.length} ${user}: ${err instanceof Error ? err.message : err}`);
	}
	await sleep(SEND_DELAY_MS);
}
console.log(`done, ${targets.length - failed} sent, ${failed} failed (log: ${logPath})`);
