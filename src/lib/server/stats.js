// Program-wide numbers, shown live on the admin page and saved once a day to the stats table so
// they can be compared over time. Days missing from the table are filled in from the backups.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
	config,
	TABLES,
	SHIPPING_TABLE,
	STATS_TABLE,
	FEEDBACK_TABLE,
	F,
	PARTICIPANT_HAS_SLACK_ID
} from './config.js';
import * as airtable from './airtable.js';
import { listBackups } from './jobs.js';
import { prizesUnlocked } from './streak.js';
import { isYswsEligible } from './verification.js';
import { PRIZES, SHIRT_PRIZE } from '../prizes.js';

/** @typedef {import('./airtable.js').AirtableRecord} AirtableRecord */

export const STATS_TZ = 'America/New_York';
const PLATFORMS = ['youtube', 'tiktok', 'instagram'];

/** @param {string | Date | undefined} when */
export const easternDate = (when) =>
	when ? new Intl.DateTimeFormat('en-CA', { timeZone: STATS_TZ }).format(new Date(when)) : '';

/**
 * @param {Map<any, number>} map
 * @param {string | number} key
 * @param {number} [by]
 */
function bump(map, key, by = 1) {
	map.set(key, (map.get(key) ?? 0) + by);
}

// Net Promoter Score on the 1-10 scale: % of 9-10s minus % of 1-6s.
/** @param {number[]} scores */
export function nps(scores) {
	if (!scores.length) return null;
	const promoters = scores.filter((s) => s >= 9).length;
	const detractors = scores.filter((s) => s <= 6).length;
	return Math.round(((promoters - detractors) / scores.length) * 1000) / 10;
}

/**
 * @param {AirtableRecord[]} participants
 * @param {AirtableRecord[]} allSubmissions deleted ones included
 * @param {AirtableRecord[]} days
 * @param {AirtableRecord[]} shipping
 * @param {AirtableRecord[]} [feedback]
 * @param {string} [today] Eastern date the "today" counts are for
 */
export function programStats(participants, allSubmissions, days, shipping, feedback = [], today = easternDate(new Date())) {
	const pf = F.participants;
	const sf = F.submissions;
	/** @param {string} status */
	const withStatus = (status) =>
		participants.filter((p) => (p.fields[pf.status] ?? 'notStarted') === status).length;
	/** @param {(p: AirtableRecord) => number} of */
	const sumOf = (of) => participants.reduce((sum, p) => sum + of(p), 0);
	const submissions = allSubmissions.filter((s) => !s.fields[sf.deletedAt]);
	const live = participants.filter((p) => (p.fields[pf.currentStreak] ?? 0) > 0);
	const primaries = submissions.filter((s) => !s.fields[sf.primarySubmission]);

	/** @type {Map<string, { posted: number, frozen: number, missed: number, videos: number, links: number, views: number, signups: number }>} */
	const byDate = new Map();
	/** @param {string} date */
	const row = (date) => {
		if (!byDate.has(date)) {
			byDate.set(date, { posted: 0, frozen: 0, missed: 0, videos: 0, links: 0, views: 0, signups: 0 });
		}
		return /** @type {NonNullable<ReturnType<typeof byDate.get>>} */ (byDate.get(date));
	};
	for (const d of days) {
		const status = d.fields[F.days.status];
		const date = d.fields[F.days.date];
		if (d.fields[F.days.deletedAt] || !date || !['posted', 'frozen', 'missed'].includes(status)) continue;
		row(date)[/** @type {'posted' | 'frozen' | 'missed'} */ (status)]++;
	}
	for (const s of submissions) {
		const date = s.fields[sf.day];
		if (!date) continue;
		const r = row(date);
		r.links++;
		r.views += s.fields[sf.views] ?? 0;
		if (!s.fields[sf.primarySubmission]) r.videos++;
	}
	for (const p of participants) {
		const date = easternDate(p.createdTime);
		if (date) row(date).signups++;
	}

	const streaks = new Map();
	for (const p of live) bump(streaks, p.fields[pf.currentStreak]);
	const daysCompleted = new Map();
	for (const p of participants) {
		const n = p.fields[pf.daysCompleted] ?? 0;
		if (n > 0) bump(daysCompleted, n);
	}
	const platforms = new Map();
	const platformViews = new Map();
	for (const s of submissions) {
		bump(platforms, s.fields[sf.platform]);
		bump(platformViews, s.fields[sf.platform], s.fields[sf.views] ?? 0);
	}
	const reviews = new Map();
	for (const s of primaries) bump(reviews, s.fields[sf.reviewStatus] ?? 'unreviewed');
	// Rejecting deletes the video, so rejections are counted from every video, not just live ones.
	const rejected = allSubmissions.filter(
		(s) => !s.fields[sf.primarySubmission] && s.fields[sf.reviewStatus] === 'rejected'
	).length;
	if (rejected) reviews.set('rejected', rejected);

	const shirtSlackIds = new Set(
		participants
			.filter((p) => prizesUnlocked(p.fields[pf.lastMilestone]).includes(SHIRT_PRIZE))
			.map((p) => p.fields[pf.slackId])
	);
	const shirtForms = shipping.filter((s) => shirtSlackIds.has(s.fields[F.shipping.slackId]));
	/** @param {Map<string | number, number>} map */
	const sorted = (map) => [...map].sort((a, b) => Number(a[0]) - Number(b[0]));
	const todayRow = byDate.get(today);
	const scores = feedback.map((f) => Number(f.fields[F.feedback.score])).filter((n) => n >= 1 && n <= 10);

	return {
		signups: participants.length,
		verified: participants.filter((p) => isYswsEligible(p.fields[pf.yswsEligible])).length,
		started: participants.filter((p) => (p.fields[pf.daysCompleted] ?? 0) > 0).length,
		live: live.length,
		active: withStatus('active'),
		frozen: withStatus('frozen'),
		broken: withStatus('broken'),
		notStarted: withStatus('notStarted'),
		averageStreak: live.length
			? Math.round((live.reduce((sum, p) => sum + p.fields[pf.currentStreak], 0) / live.length) * 10) / 10
			: 0,
		longestStreak: Math.max(0, ...live.map((p) => p.fields[pf.currentStreak])),
		freezesBanked: sumOf((p) => p.fields[pf.streakFreezes] ?? 0),
		daysCompleted: sumOf((p) => p.fields[pf.daysCompleted] ?? 0),
		warnings: sumOf((p) => p.fields[pf.warnings] ?? 0),
		remindersOff: participants.filter((p) => p.fields[pf.remindersOff]).length,
		videos: primaries.length,
		links: submissions.length,
		views: submissions.reduce((sum, s) => sum + (s.fields[sf.views] ?? 0), 0),
		likes: submissions.reduce((sum, s) => sum + (s.fields[sf.likes] ?? 0), 0),
		youtubeViews: platformViews.get('youtube') ?? 0,
		tiktokViews: platformViews.get('tiktok') ?? 0,
		instagramViews: platformViews.get('instagram') ?? 0,
		youtubeLinks: platforms.get('youtube') ?? 0,
		tiktokLinks: platforms.get('tiktok') ?? 0,
		instagramLinks: platforms.get('instagram') ?? 0,
		postedToday: todayRow?.posted ?? 0,
		frozenToday: todayRow?.frozen ?? 0,
		missedToday: todayRow?.missed ?? 0,
		signupsToday: todayRow?.signups ?? 0,
		videosToday: todayRow?.videos ?? 0,
		starred: reviews.get('starred') ?? 0,
		passed: reviews.get('passed') ?? 0,
		rejected,
		unreviewed: reviews.get('unreviewed') ?? 0,
		escalated: primaries.filter((s) => s.fields[sf.escalatedAt] && !s.fields[sf.reviewStatus]).length,
		pending: submissions.filter((s) => s.fields[sf.pendingCheck]).length,
		deletedVideos: allSubmissions.filter((s) => s.fields[sf.deletedAt] && !s.fields[sf.primarySubmission]).length,
		unavailable: submissions.filter((s) => s.fields[sf.availability]).length,
		noHcMention: submissions.filter((s) => s.fields[sf.noHcMention]).length,
		repeats: submissions.filter(
			(s) => s.fields[sf.repeatOf] && s.fields[sf.repeatReason] !== 'dismissed'
		).length,
		feedbackResponses: scores.length,
		nps: nps(scores),
		milestones: PRIZES.map((p) => ({
			...p,
			reached: participants.filter((x) => (x.fields[pf.lastMilestone] ?? 0) >= p.milestone).length
		})),
		shippingForms: shipping.length,
		shirtsUnlocked: shirtSlackIds.size,
		shirtSizesIn: shirtForms.filter((s) => s.fields[F.shipping.shirtSize]).length,
		shirtFormsMissingSize: shirtForms.filter((s) => !s.fields[F.shipping.shirtSize]).length,
		platforms: [...platforms].map(([platform, links]) => ({ platform, links, views: platformViews.get(platform) ?? 0 })),
		reviews: [...reviews].map(([status, count]) => ({ status, count })),
		streaks: sorted(streaks).map(([streak, count]) => ({ streak, count })),
		daysCompletedSpread: sorted(daysCompleted).map(([days, count]) => ({ days, count })),
		byDate: [...byDate]
			.sort((a, b) => (a[0] < b[0] ? 1 : -1))
			.map(([date, r]) => ({ date, ...r, alive: r.posted + r.frozen }))
	};
}

/** @typedef {ReturnType<typeof programStats>} ProgramStats */

/**
 * @param {ProgramStats} stats
 * @param {string} date
 * @param {string} takenAt
 */
export function statsFields(stats, date, takenAt) {
	/** @type {Record<string, any>} */
	const fields = { [F.stats.date]: date, [F.stats.takenAt]: takenAt };
	for (const [key, name] of Object.entries(F.stats)) {
		const value = stats[/** @type {keyof ProgramStats} */ (key)];
		if (typeof value === 'number' || value === null) fields[name] = value;
	}
	fields[F.stats.details] = JSON.stringify({
		streaks: stats.streaks,
		daysCompleted: stats.daysCompletedSpread,
		milestones: stats.milestones.map((m) => ({ milestone: m.milestone, reached: m.reached })),
		platforms: stats.platforms.filter((p) => !PLATFORMS.includes(p.platform)),
		byDate: stats.byDate.slice(0, 14)
	});
	return fields;
}

// The numeric columns of a saved row, keyed like ProgramStats.
/** @param {AirtableRecord} row */
export function statsFromRow(row) {
	/** @type {Record<string, number>} */
	const stats = {};
	for (const [key, name] of Object.entries(F.stats)) {
		const value = row.fields[name];
		if (typeof value === 'number') stats[key] = value;
	}
	return stats;
}

/** @param {string} file */
export const backupTime = (file) => {
	const [, date, hhmm] = file.match(/^airtable_([\d-]+)_(\d{4})\.json$/) ?? [];
	return new Date(`20${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`);
};

/** @param {string} file */
async function statsFromBackup(file) {
	const { tables } = JSON.parse(await readFile(path.join(config.backupDir, file), 'utf8'));
	if (!tables[TABLES.participants] || !tables[TABLES.submissions]) return null;
	const takenAt = backupTime(file);
	return programStats(
		tables[TABLES.participants].filter((/** @type {AirtableRecord} */ p) => p.fields[F.participants.slackId]),
		tables[TABLES.submissions],
		tables[TABLES.days] ?? [],
		tables[SHIPPING_TABLE] ?? [],
		[],
		easternDate(takenAt)
	);
}

/**
 * Saves today's numbers, replacing the row from earlier today, and back-fills any earlier day that
 * has a backup but no row yet.
 * @param {ProgramStats} [current] already-computed live numbers
 */
export async function runStatsSnapshot(current) {
	const now = new Date();
	const today = easternDate(now);
	const rows = await airtable.list(STATS_TABLE);
	const byDate = new Map(rows.map((r) => [r.fields[F.stats.date], r]));

	let backfilled = 0;
	/** @type {Map<string, string>} */
	const lastOfDay = new Map();
	for (const file of await listBackups()) {
		const date = easternDate(backupTime(file));
		if (date !== today && !byDate.has(date) && !lastOfDay.has(date)) lastOfDay.set(date, file);
	}
	for (const [date, file] of lastOfDay) {
		const stats = await statsFromBackup(file).catch((err) => {
			console.error('stats from backup failed', file, err);
			return null;
		});
		if (!stats) continue;
		await airtable.create(STATS_TABLE, statsFields(stats, date, backupTime(file).toISOString()));
		backfilled++;
	}

	const stats = current ?? (await liveStats(today));
	const fields = statsFields(stats, today, now.toISOString());
	const existing = byDate.get(today);
	if (existing) await airtable.update(STATS_TABLE, existing.id, fields);
	else await airtable.create(STATS_TABLE, fields);
	return { date: today, backfilled };
}

/** @param {string} [today] */
export async function liveStats(today) {
	const [participants, submissions, days, shipping, feedback] = await Promise.all([
		airtable.list(TABLES.participants, { filterByFormula: PARTICIPANT_HAS_SLACK_ID }),
		airtable.list(TABLES.submissions),
		airtable.list(TABLES.days),
		airtable.list(SHIPPING_TABLE).catch(() => []),
		airtable.list(FEEDBACK_TABLE).catch(() => [])
	]);
	return programStats(participants, submissions, days, shipping, feedback, today);
}

// Saved days, oldest first, newest `limit` of them.
export async function statsHistory(limit = 30) {
	const rows = await airtable.list(STATS_TABLE, { sort: [{ field: F.stats.date, direction: 'desc' }] }).catch((err) => {
		console.error('stats history failed', err);
		return [];
	});
	return rows
		.slice(0, limit)
		.reverse()
		.map((r) => ({ date: String(r.fields[F.stats.date]), stats: statsFromRow(r) }));
}
