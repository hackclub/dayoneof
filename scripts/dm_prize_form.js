// One-off for after the program ends: DMs everyone who unlocked a prize a link to /end. Skips
// anyone who already submitted it or is in the sent log, so a rerun can't double-DM.
//
//   node --env-file=.env scripts/dm_prize_form.js                 # print who would get it
//   node --env-file=.env scripts/dm_prize_form.js --to U0123ABC   # send only to one user (test)
//   node --env-file=.env scripts/dm_prize_form.js --apply         # send to everyone

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	tablesFor,
	endFeedbackTableFor,
	PARTICIPANT_HAS_SLACK_ID,
	PROGRAM_ENDS_AT,
	F
} from '../src/lib/server/schema.js';
import { PRIZES } from '../src/lib/prizes.js';

const API = 'https://api.airtable.com/v0';
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
const siteUrl = envVar('PUBLIC_SITE_URL').replace(/\/$/, '');

const logDir = process.env.BACKUP_DIR || 'backups';
const logPath = join(logDir, `prize_form_dm_${appEnv}.log`);

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

// Same rule as /end: anyone whose last_milestone reached the first prize.
async function prizeWinnerSlackIds() {
	const firstPrize = Math.min(...PRIZES.map((p) => p.milestone));
	const participants = await airtableRows(
		tablesFor(appEnv).participants,
		`AND(${PARTICIPANT_HAS_SLACK_ID}, {${F.participants.lastMilestone}} >= ${firstPrize})`,
		[F.participants.slackId]
	);
	return [...new Set(participants.map((p) => p[F.participants.slackId]).filter(Boolean))];
}

async function submittedSlackIds() {
	const rows = await airtableRows(endFeedbackTableFor(appEnv), 'TRUE()', [F.endFeedback.slackId]);
	return new Set(rows.map((r) => r[F.endFeedback.slackId]));
}

function sentLog() {
	if (!existsSync(logPath)) return new Set();
	return new Set(readFileSync(logPath, 'utf8').split('\n').filter(Boolean));
}

const formUrl = `${siteUrl}/end`;
const text = `Thanks for participating in Day One Of!! Please submit this form to claim your prizes! The form will close on December 10th, so please submit as soon as you can! ${formUrl}`;

/** @param {string} user */
async function send(user) {
	const { channel } = await slack('conversations.open', { users: user });
	await slack('chat.postMessage', { channel: channel.id, text, unfurl_links: 'false', unfurl_media: 'false' });
}

console.log(`--- message ---\n${text}\n---------------`);

if (testUser) {
	await send(testUser);
	console.log(`sent test to ${testUser}`);
	process.exit(0);
}

const [winners, submitted] = await Promise.all([prizeWinnerSlackIds(), submittedSlackIds()]);
const sent = sentLog();
const targets = winners.filter((id) => !sent.has(id) && !submitted.has(id));
console.log(
	`${targets.length} prize winners to DM (APP_ENV=${appEnv}, ${winners.length} eligible, ` +
		`${submitted.size} already submitted, ${sent.size} already sent)`
);

if (!apply) {
	console.log(targets.join('\n'));
	console.log('dry run, pass --apply to send');
	process.exit(0);
}

// Until then /end only opens for people at 25 days, so everyone else would hit a closed form.
if (Date.now() < PROGRAM_ENDS_AT.getTime()) {
	console.log(`the program hasn't ended yet (${PROGRAM_ENDS_AT.toISOString()}), not sending`);
	process.exit(1);
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
