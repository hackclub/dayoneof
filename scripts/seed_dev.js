// Fills the dev tables with believable participants and submissions so the site can be looked at
// populated. Everything is real: the videos are shortform rows from unified-socials-db, and each
// participant is one of their actual authors, carrying that author's own posts, view counts,
// titles, archive thumbnails and links, and publish dates. A video the same account cross-posted
// under the same caption gets its other platforms linked, the way a thread reply would.
//
//   node --env-file=.env scripts/seed_dev.js
//   node --env-file=.env scripts/seed_dev.js --clean    # remove seeded rows, insert nothing
//
// Every row it writes is tagged by a `USEED..` slack id, and a run clears those first, so it is
// idempotent and never touches a participant who signed in for real. Refuses to run against prod.

import { tablesFor, shippingTableFor, F } from '../src/lib/server/schema.js';
import { MILESTONES, prizesUnlocked } from '../src/lib/server/streak.js';

const API = 'https://api.airtable.com/v0';
const PEOPLE_COUNT = 15;
const SEED_PREFIX = 'USEED';
const MAX_POSTS_PER_PERSON = 9;
// Shortform only: a reel, a Short or a TikTok, never a 40-minute upload that happens to be tracked.
const MAX_DURATION_SECONDS = 180;

// Made-up but well-formed, so the /form and admin shipping views have something to show.
const ADDRESSES = [
	{ line1: '15 Falls Rd', city: 'Shelburne', state: 'VT', zip: '05482', country: 'US' },
	{ line1: '742 Evergreen Ter', city: 'Springfield', state: 'IL', zip: '62704', country: 'US' },
	{ line1: '221B Baker St', city: 'London', state: '', zip: 'NW1 6XE', country: 'GB' },
	{ line1: 'Unter den Linden 77', city: 'Berlin', state: '', zip: '10117', country: 'DE' },
	{ line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', zip: '560001', country: 'IN' },
	{ line1: '100 Queen St W', city: 'Toronto', state: 'ON', zip: 'M5H 2N2', country: 'CA' },
	{ line1: '1 Macquarie St', city: 'Sydney', state: 'NSW', zip: '2000', country: 'AU' }
];

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
	/** @type {{ id: string }[]} */
	const created = [];
	for (let i = 0; i < rows.length; i += 10) {
		const { records } = await api(token, `${API}/${baseId}/${encodeURIComponent(table)}`, {
			method: 'POST',
			body: JSON.stringify({ records: rows.slice(i, i + 10).map((fields) => ({ fields })) })
		});
		created.push(...records);
	}
	return created;
}

// Cross-posts share a caption but not always a channel name (Hack Club vs starthackclub).
/** @param {string} title */
const captionKey = (title) => title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);

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
	/** @type {Map<string, any[]>} */
	const byCaption = new Map();
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

			const post = {
				unifiedId: String(row.id),
				platform: row.platform,
				videoId: row.platform_post_id,
				url: row.url,
				title: (row.title ?? '').split('\n')[0].trim().slice(0, 100),
				views: row.views,
				publishedAt: row.published_at,
				thumbnailUrl: String(row.preview_thumbnail_url).replace(/^http:\/\//, 'https://'),
				archiveUrl: row.video_url ?? '',
				likes: row.likes ?? 0,
				noHcMention: row.hc_share === 0
			};
			const key = captionKey(post.title);
			if (key.length >= 12) byCaption.set(key, [...(byCaption.get(key) ?? []), post]);

			const posts = byAuthor.get(author) ?? [];
			if (posts.length >= MAX_POSTS_PER_PERSON) continue;
			posts.push(post);
			byAuthor.set(author, posts);
		}
	}

	// Prefer the accounts with the most posts — they make the fullest-looking profiles and boards.
	const authors = [...byAuthor.entries()]
		.map(([name, posts]) => ({
			name,
			posts: posts.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
		}))
		.sort((a, b) => b.posts.length - a.posts.length)
		.slice(0, people);

	// One other upload per platform, never a video some participant already submitted.
	const used = new Set(authors.flatMap((a) => a.posts.map((p) => `${p.platform}:${p.videoId}`)));
	for (const post of authors.flatMap((a) => a.posts)) {
		post.otherPlatforms = [];
		for (const other of byCaption.get(captionKey(post.title)) ?? []) {
			const key = `${other.platform}:${other.videoId}`;
			if (used.has(key) || other.platform === post.platform) continue;
			if (post.otherPlatforms.some((/** @type {any} */ o) => o.platform === other.platform)) continue;
			used.add(key);
			post.otherPlatforms.push(other);
		}
	}
	return authors;
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
	const SHIPPING = shippingTableFor(appEnv);
	const token = envVar('AIRTABLE_TOKEN', appEnv);
	const baseId = envVar('AIRTABLE_BASE_ID', appEnv);

	// Wipe whatever a previous run left behind so re-running doesn't stack duplicates. Only rows
	// carrying a seeded slack id are touched — a real signed-in participant is left alone.
	const seeded = `LEFT({${F.participants.slackId}}, ${SEED_PREFIX.length}) = "${SEED_PREFIX}"`;
	for (const table of [TABLES.submissions, TABLES.days, TABLES.participants, SHIPPING]) {
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
	/** @type {{ slackId: string, postedAt: Date, posts: any[] }[]} */
	const otherPlatforms = [];
	const days = [];
	const shipping = [];
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
			for (const other of video.otherPlatforms) views += other.views;
			counter++;
			otherPlatforms.push({ slackId, postedAt, posts: video.otherPlatforms });

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
				[F.submissions.views]: video.views,
				[F.submissions.likes]: video.likes,
				[F.submissions.noHcMention]: video.noHcMention,
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

		const lastMilestone = MILESTONES.findLast((m) => streak >= m) ?? null;
		const prizes = prizesUnlocked(lastMilestone);
		// Every other person with a prize has an address in, and some of those have had one shipped.
		if (prizes.length && i % 2 === 0) {
			const address = ADDRESSES[i % ADDRESSES.length];
			const [firstName, ...rest] = author.name.split(/\s+/);
			shipping.push({
				[F.shipping.slackId]: slackId,
				[F.shipping.firstName]: firstName,
				[F.shipping.lastName]: rest.join(' ') || 'Seed',
				[F.shipping.email]: `${slackId.toLowerCase()}@example.com`,
				[F.shipping.slackUsername]: author.name,
				[F.shipping.addressLine1]: address.line1,
				[F.shipping.city]: address.city,
				[F.shipping.state]: address.state,
				[F.shipping.zip]: address.zip,
				[F.shipping.country]: address.country,
				[F.shipping.birthday]: `${2008 + (i % 5)}-0${1 + (i % 9)}-1${i % 10}`,
				[F.shipping.shippedPrizes]: i % 4 === 0 ? prizes.slice(0, 1) : [],
				[F.shipping.submittedAt]: new Date().toISOString()
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
			[F.participants.lastDay]: dates[0],
			[F.participants.verificationStatus]: 'verified',
			[F.participants.yswsEligible]: true,
			[F.participants.totalViews]: views,
			...(lastMilestone ? { [F.participants.lastMilestone]: lastMilestone } : {})
		});
	});

	await create(token, baseId, TABLES.participants, participants);
	await create(token, baseId, TABLES.days, days);
	const primaries = await create(token, baseId, TABLES.submissions, submissions);
	const others = otherPlatforms.flatMap(({ slackId, postedAt, posts }, i) =>
		posts.map((/** @type {any} */ other) => ({
			[F.submissions.slackId]: slackId,
			[F.submissions.url]: other.url,
			[F.submissions.platform]: other.platform,
			[F.submissions.videoId]: other.videoId,
			[F.submissions.postedAt]: postedAt.toISOString(),
			[F.submissions.day]: dayString(postedAt),
			[F.submissions.countedTowardStreak]: false,
			[F.submissions.channelId]: 'CSEEDCHANNEL',
			[F.submissions.views]: other.views,
			[F.submissions.likes]: other.likes,
			[F.submissions.noHcMention]: other.noHcMention,
			[F.submissions.title]: other.title,
			[F.submissions.thumbnailUrl]: other.thumbnailUrl,
			[F.submissions.archiveUrl]: other.archiveUrl,
			[F.submissions.unifiedId]: other.unifiedId,
			[F.submissions.primarySubmission]: primaries[i].id
		}))
	);
	await create(token, baseId, TABLES.submissions, others);
	await create(token, baseId, SHIPPING, shipping);

	console.log(
		`seeded ${participants.length} participants, ${submissions.length} submissions ` +
			`(+${others.length} other platforms) and ` +
			`${shipping.length} shipping addresses into ${baseId}`
	);
	console.log('done');
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exitCode = 1;
});
