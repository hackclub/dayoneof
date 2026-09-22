// Fills the dev tables with believable participants and submissions so the site can be looked at
// populated. Everything is real: the videos are shortform rows from unified-socials-db, and each
// participant is one of their actual authors, carrying that author's own posts, view counts,
// titles, archive thumbnails and links, and publish dates.
//
//   node --env-file=.env scripts/seed_dev.js
//   node --env-file=.env scripts/seed_dev.js --clean    # remove seeded rows, insert nothing
//
// Every row it writes is tagged by a `USEED..` slack id, and a run clears those first, so it is
// idempotent and never touches a participant who signed in for real. Refuses to run against prod.

import { tablesFor, F } from '../src/lib/server/schema.js';

const API = 'https://api.airtable.com/v0';
const PEOPLE_COUNT = 15;
const SEED_PREFIX = 'USEED';
const MAX_POSTS_PER_PERSON = 9;
// Shortform only: a reel, a Short or a TikTok, never a 40-minute upload that happens to be tracked.
const MAX_DURATION_SECONDS = 180;

const TIMEZONES = [
	'America/New_York',
	'America/Chicago',
	'America/Los_Angeles',
	'Europe/London',
	'Europe/Berlin',
	'Asia/Kolkata',
	'Asia/Tokyo',
	'Australia/Sydney'
];

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
	return body ? JSON.parse(body) : {};
}

/**
 * @param {string} token
 * @param {string} baseId
 * @param {string} table
 * @param {string} [filterByFormula]
 */
async function list(token, baseId, table, filterByFormula) {
	const records = [];
	let offset;
	do {
		const params = new URLSearchParams({ pageSize: '100' });
		if (filterByFormula) params.set('filterByFormula', filterByFormula);
		if (offset) params.set('offset', offset);
		const page = await api(token, `${API}/${baseId}/${encodeURIComponent(table)}?${params}`);
		records.push(...page.records);
		offset = page.offset;
	} while (offset);
	return records;
}

/**
 * @param {string} token
 * @param {string} baseId
 * @param {string} table
 * @param {Record<string, unknown>[]} rows
 */
async function create(token, baseId, table, rows) {
	for (let i = 0; i < rows.length; i += 10) {
		await api(token, `${API}/${baseId}/${encodeURIComponent(table)}`, {
			method: 'POST',
			body: JSON.stringify({ records: rows.slice(i, i + 10).map((fields) => ({ fields })) })
		});
	}
}

/**
 * @param {string} token
 * @param {string} baseId
 * @param {string} table
 * @param {string[]} ids
 */
async function remove(token, baseId, table, ids) {
	for (let i = 0; i < ids.length; i += 10) {
		const params = new URLSearchParams();
		for (const id of ids.slice(i, i + 10)) params.append('records[]', id);
		await api(token, `${API}/${baseId}/${encodeURIComponent(table)}?${params}`, { method: 'DELETE' });
	}
}

/**
 * Pages the unified-socials-db REST API for shortform videos worth showing, and groups them by the
 * account that actually posted them, so a seeded participant is a real creator with a real body of
 * work rather than a name stapled to someone else's videos.
 * @param {number} people
 */
async function fetchAuthors(people) {
	const token = process.env.UNIFIED_SOCIALS_TOKEN;
	if (!token) throw new Error('missing required env var: UNIFIED_SOCIALS_TOKEN');
	const base = process.env.UNIFIED_SOCIALS_API_URL ?? 'https://unified-socials-db.hackclub.com/api/v1';

	/** @type {Map<string, any[]>} */
	const byAuthor = new Map();
	for (let offset = 0; offset < 3000; offset += 200) {
		const params = new URLSearchParams({ limit: '200', offset: String(offset), kind: 'video' });
		const res = await fetch(`${base}/posts?${params}`, {
			headers: { Authorization: `Bearer ${token}` }
		});
		if (!res.ok) throw new Error(`unified-socials fetch failed: ${res.status}`);
		const { rows } = await res.json();
		if (!rows.length) break;

		for (const row of rows) {
			const author = String(row.channel_name ?? '').trim();
			if (!author || !row.preview_thumbnail_url || row.views == null || !row.published_at) continue;
			if (!(row.duration_seconds <= MAX_DURATION_SECONDS)) continue;
			if (!['youtube', 'instagram', 'tiktok'].includes(row.platform)) continue;

			const posts = byAuthor.get(author) ?? [];
			if (posts.length >= MAX_POSTS_PER_PERSON) continue;
			posts.push({
				unifiedId: String(row.id),
				platform: row.platform,
				videoId: row.platform_post_id,
				url: row.url,
				title: (row.title ?? '').split('\n')[0].trim().slice(0, 100),
				views: row.views,
				publishedAt: row.published_at,
				thumbnailUrl: String(row.preview_thumbnail_url).replace(/^http:\/\//, 'https://'),
				archiveUrl: row.video_url ?? ''
			});
			byAuthor.set(author, posts);
		}
	}

	// Prefer the accounts with the most posts — they make the fullest-looking profiles and boards.
	return [...byAuthor.entries()]
		.map(([name, posts]) => ({
			name,
			posts: posts.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
		}))
		.sort((a, b) => b.posts.length - a.posts.length)
		.slice(0, people);
}

/** @param {Date} date */
const dayString = (date) => date.toISOString().slice(0, 10);

async function main() {
	const args = process.argv.slice(2);
	const clean = args.includes('--clean');
	const appEnv = /** @type {'dev' | 'prod'} */ (
		(process.env.APP_ENV ?? 'dev').trim().toLowerCase() === 'prod' ? 'prod' : 'dev'
	);
	if (appEnv === 'prod') throw new Error('seed_dev.js only ever writes to the dev tables');

	const TABLES = tablesFor(appEnv);
	const token = envVar('AIRTABLE_TOKEN', appEnv);
	const baseId = envVar('AIRTABLE_BASE_ID', appEnv);

	// Wipe whatever a previous run left behind so re-running doesn't stack duplicates. Only rows
	// carrying a seeded slack id are touched — a real signed-in participant is left alone.
	const seeded = `LEFT({${F.participants.slackId}}, ${SEED_PREFIX.length}) = "${SEED_PREFIX}"`;
	for (const table of [TABLES.submissions, TABLES.days, TABLES.participants]) {
		const existing = await list(token, baseId, table, seeded);
		if (existing.length) {
			await remove(token, baseId, table, existing.map((r) => r.id));
			console.log(`  cleared ${existing.length} seeded rows from ${table}`);
		}
	}
	if (clean) {
		console.log('done');
		return;
	}

	const authors = await fetchAuthors(PEOPLE_COUNT);
	console.log(
		`pulled ${authors.reduce((n, a) => n + a.posts.length, 0)} shortform videos from ` +
			`${authors.length} authors on unified-socials-db`
	);

	const participants = [];
	const submissions = [];
	const days = [];
	let counter = 0;

	authors.forEach((author, i) => {
		const slackId = `${SEED_PREFIX}${String(i + 1).padStart(2, '0')}`;
		// The streak is what the site would have counted: consecutive days ending at the newest post.
		const dates = [...new Set(author.posts.map((p) => dayString(new Date(p.publishedAt))))].sort(
			(a, b) => (a < b ? 1 : -1)
		);
		let streak = 0;
		for (const [n, date] of dates.entries()) {
			const expected = new Date(`${dates[0]}T00:00:00Z`);
			expected.setUTCDate(expected.getUTCDate() - n);
			if (date !== dayString(expected)) break;
			streak++;
		}
		const freezes = Math.min(3, Math.floor(author.posts.length / 3));
		let views = 0;

		for (const [n, video] of author.posts.entries()) {
			const postedAt = new Date(video.publishedAt);
			views += video.views;
			counter++;

			submissions.push({
				[F.submissions.slackId]: slackId,
				[F.submissions.url]: video.url,
				[F.submissions.platform]: video.platform,
				[F.submissions.videoId]: video.videoId,
				[F.submissions.postedAt]: postedAt.toISOString(),
				[F.submissions.day]: dayString(postedAt),
				[F.submissions.countedTowardStreak]: true,
				[F.submissions.channelId]: 'CSEEDCHANNEL',
				[F.submissions.messageTs]: `${Math.floor(postedAt.getTime() / 1000)}.000${counter}`,
				[F.submissions.reviewCount]: (i + n) % 4,
				[F.submissions.views]: video.views,
				[F.submissions.title]: video.title,
				[F.submissions.thumbnailUrl]: video.thumbnailUrl,
				[F.submissions.archiveUrl]: video.archiveUrl,
				[F.submissions.unifiedId]: video.unifiedId,
				[F.submissions.streakAtPost]: Math.max(1, streak - n),
				[F.submissions.freezesAtPost]: freezes
			});
		}

		for (const date of dates) {
			days.push({
				[F.days.slackId]: slackId,
				[F.days.date]: date,
				[F.days.status]: 'posted'
			});
		}

		participants.push({
			[F.participants.slackId]: slackId,
			[F.participants.name]: author.name,
			[F.participants.email]: `${slackId.toLowerCase()}@example.com`,
			[F.participants.tz]: TIMEZONES[i % TIMEZONES.length],
			[F.participants.status]: 'active',
			[F.participants.daysCompleted]: dates.length,
			[F.participants.currentStreak]: streak,
			[F.participants.streakFreezes]: freezes,
			[F.participants.verificationStatus]: 'verified_eligible',
			[F.participants.reminderHour]: 18,
			[F.participants.totalViews]: views
		});
	});

	await create(token, baseId, TABLES.participants, participants);
	await create(token, baseId, TABLES.days, days);
	await create(token, baseId, TABLES.submissions, submissions);

	console.log(
		`seeded ${participants.length} participants and ${submissions.length} submissions into ${baseId}`
	);
	console.log('done');
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exitCode = 1;
});
