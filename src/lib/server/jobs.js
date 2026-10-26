// Shared job bodies behind /api/cron/* — one implementation per job, reused by the admin panel.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config, requireEnv, TABLES, F, PARTICIPANT_HAS_SLACK_ID, SUBMISSION_NOT_DELETED } from './config.js';
import { tablesFor, shippingTableFor } from './schema.js';
import * as airtable from './airtable.js';
import * as slack from './slack.js';
import * as unified from './unified.js';
import { messages, statsLine } from './messages.js';
import { serialize } from './queue.js';
import { streakDay, addDays, settleMissedDays, compareStreaks, viewMilestoneCrossed, prizeFor } from './streak.js';
import { groupByVideo, combineStats, totalViews } from './videos.js';
import { checkAvailability } from './availability.js';
import { fetchPreview } from './previews.js';
import { findRepeats } from './repeats.js';

/** @typedef {import('./airtable.js').AirtableRecord} AirtableRecord */

/** @param {NonNullable<Awaited<ReturnType<typeof unified.fetchPostByPlatformId>>>} post */
export function postFields(post) {
	return {
		[F.submissions.views]: post.views,
		[F.submissions.likes]: post.likes,
		// Left out while blank, so a stand-in from previews.js isn't wiped before the archive is ready.
		...(post.title ? { [F.submissions.title]: post.title } : {}),
		...(post.thumbnailUrl ? { [F.submissions.thumbnailUrl]: post.thumbnailUrl } : {}),
		[F.submissions.archiveUrl]: post.archiveUrl,
		[F.submissions.unifiedId]: String(post.id),
		[F.submissions.noHcMention]: post.noHcMention,
		// Rounded to the field's precision so an unchanged duration never reads back as a change.
		[F.submissions.durationSeconds]:
			post.durationSeconds == null ? null : Math.round(post.durationSeconds * 10) / 10,
		// In Airtable's own ISO form for the same reason.
		[F.submissions.publishedAt]:
			post.publishedAt == null ? null : new Date(post.publishedAt).toISOString()
	};
}

// Only fills what's still blank, so it never overwrites anything unified-socials already gave.
/**
 * @param {{ platform: string, url: string }} video
 * @param {Record<string, any>} fields
 */
export async function previewFields(video, fields) {
	if (fields[F.submissions.thumbnailUrl]) return {};
	const preview = await fetchPreview(video);
	if (!preview?.thumbnailUrl) return {};
	return {
		[F.submissions.thumbnailUrl]: preview.thumbnailUrl,
		...(!fields[F.submissions.title] && preview.title ? { [F.submissions.title]: preview.title } : {})
	};
}

/** @param {string} slackId */
export function findParticipant(slackId) {
	return airtable.find(TABLES.participants, airtable.eq(F.participants.slackId, slackId));
}

// Re-sums stored submission views rather than incrementing, so a failed fetch never skews totals.
/** @param {AirtableRecord} participant */
export async function syncParticipantTotalViews(participant) {
	const submissions = await airtable.list(TABLES.submissions, {
		filterByFormula: `AND(${airtable.eq(F.submissions.slackId, participant.fields[F.participants.slackId])}, ${SUBMISSION_NOT_DELETED})`
	});
	const total = submissions.reduce((sum, s) => sum + (s.fields[F.submissions.views] ?? 0), 0);
	await airtable.update(TABLES.participants, participant.id, { [F.participants.totalViews]: total });
	return total;
}

/**
 * @param {AirtableRecord[]} participants
 * @param {AirtableRecord[]} submissions
 */
async function syncTotalViews(participants, submissions) {
	/** @type {Map<string, number>} */
	const totals = new Map();
	for (const s of submissions) {
		const slackId = s.fields[F.submissions.slackId];
		totals.set(slackId, (totals.get(slackId) ?? 0) + (s.fields[F.submissions.views] ?? 0));
	}
	for (const participant of participants) {
		const total = totals.get(participant.fields[F.participants.slackId]) ?? 0;
		if (participant.fields[F.participants.totalViews] === total) continue;
		const updated = await airtable.update(TABLES.participants, participant.id, {
			[F.participants.totalViews]: total
		});
		participant.fields = updated.fields;
	}
}

// Writes a day row for every unposted day since the participant's last one through throughDay,
// spending freezes or breaking the streak. Callers run it inside serialize().
/**
 * @param {AirtableRecord} participant
 * @param {string} throughDay
 * @returns {Promise<{ record: AirtableRecord, daysSettled: number, broke: boolean }>}
 */
export async function settleParticipant(participant, throughDay) {
	const fields = participant.fields;
	const status = fields[F.participants.status];
	const lastDay = fields[F.participants.lastDay];
	if ((status !== 'active' && status !== 'frozen') || !lastDay || lastDay >= throughDay) {
		return { record: participant, daysSettled: 0, broke: false };
	}

	const { days, freezes, streak, broke } = settleMissedDays(
		{
			lastDay,
			freezes: fields[F.participants.streakFreezes] ?? 0,
			streak: fields[F.participants.currentStreak] ?? 0
		},
		throughDay
	);
	const slackId = fields[F.participants.slackId];

	for (const day of days) {
		await airtable.create(TABLES.days, {
			[F.days.slackId]: slackId,
			[F.days.date]: day.date,
			[F.days.status]: day.status
		});
	}

	const record = await airtable.update(TABLES.participants, participant.id, {
		[F.participants.lastDay]: days[days.length - 1].date,
		[F.participants.streakFreezes]: freezes,
		[F.participants.currentStreak]: streak,
		[F.participants.status]: broke ? 'broken' : 'frozen'
	});

	try {
		await slack.dm(slackId, broke ? messages.streakBroken() : messages.dayFrozen(freezes));
	} catch (err) {
		console.error('settle dm failed', err);
	}

	return { record, daysSettled: days.length, broke };
}

// Hourly, so each participant is settled within the hour after their own 3am deadline.
export async function runReconcile() {
	const participants = await airtable.list(TABLES.participants, {
		filterByFormula: `AND(${PARTICIPANT_HAS_SLACK_ID}, OR({${F.participants.status}} = "active", {${F.participants.status}} = "frozen"))`
	});

	let frozen = 0;
	let broken = 0;

	for (const participant of participants) {
		const yesterday = addDays(streakDay(participant.fields[F.participants.tz]), -1);
		if (!(participant.fields[F.participants.lastDay] < yesterday)) continue;

		const { daysSettled, broke } = await serialize(async () =>
			settleParticipant(await airtable.get(TABLES.participants, participant.id), yesterday)
		);
		if (broke) broken++;
		else if (daysSettled) frozen++;
	}

	return { processed: participants.length, frozen, broken };
}

const UNIFIED_READ_CONCURRENCY = 5;
const AVAILABILITY_CONCURRENCY = 3;
// Checks scrape the platforms' public pages, so each video is checked every few hours, not hourly.
const AVAILABILITY_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapPool(items, limit, fn) {
	/** @type {R[]} */
	const results = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

// Reads run in parallel; Airtable writes and Slack posts stay sequential for their rate limits.
/** @returns {Promise<{ viewsChecked: number, repeatsFlagged: number, submissions: AirtableRecord[] }>} */
async function refreshViews() {
	const submissions = await airtable.list(TABLES.submissions, {
		filterByFormula: SUBMISSION_NOT_DELETED
	});
	let viewsChecked = 0;

	const posts = await mapPool(submissions, UNIFIED_READ_CONCURRENCY, async (submission) => {
		const platform = submission.fields[F.submissions.platform];
		const videoId = submission.fields[F.submissions.videoId];
		if (!platform || !videoId) return null;
		try {
			return await unified.fetchPostByPlatformId(platform, videoId);
		} catch (err) {
			console.error('unified-socials views fetch failed', err);
			return null;
		}
	});

	const postById = new Map(submissions.map((s, i) => [s.id, posts[i]]));

	const checkedBefore = Date.now() - AVAILABILITY_INTERVAL_MS;
	/** @type {Map<string, Promise<string | null>>} */
	const feeds = new Map();
	const availability = await mapPool(submissions, AVAILABILITY_CONCURRENCY, async (submission) => {
		const fields = submission.fields;
		if (Date.parse(fields[F.submissions.availabilityCheckedAt] ?? '') > checkedBefore) return null;
		const post = postById.get(submission.id);
		return checkAvailability(
			{
				platform: fields[F.submissions.platform],
				videoId: fields[F.submissions.videoId],
				url: fields[F.submissions.url]
			},
			{ channelId: post?.channelId, publishedAt: post?.publishedAt },
			feeds
		);
	});
	const availabilityById = new Map(submissions.map((s, i) => [s.id, availability[i]]));
	const checkedAt = new Date().toISOString();

	// Blank and false both read back from Airtable as a missing field.
	/** @param {unknown} v */
	const blank = (v) => v == null || v === '' || v === false;
	/** @param {unknown} a @param {unknown} b */
	const same = (a, b) => (blank(a) ? blank(b) : a === b);

	for (const { primary, rows } of groupByVideo(submissions)) {
		const fetched = rows.flatMap((s) => postById.get(s.id) ?? []);
		const viewsBefore = totalViews(rows);
		const replyStatsBefore = primary.fields[F.submissions.replyStats] ?? '';
		const replyStats = fetched.length ? statsLine(combineStats(fetched)) : replyStatsBefore;

		for (const submission of rows) {
			const post = postById.get(submission.id);
			if (post) viewsChecked++;
			const available = availabilityById.get(submission.id);
			/** @type {Record<string, unknown>} */
			const changes = {
				...(post ? postFields(post) : {}),
				...(submission === primary && fetched.length ? { [F.submissions.replyStats]: replyStats } : {})
			};
			if (available) {
				changes[F.submissions.availability] = available === 'public' ? '' : available;
				changes[F.submissions.availabilityCheckedAt] = checkedAt;
			}
			if (Object.entries(changes).every(([field, value]) => same(submission.fields[field], value))) {
				continue;
			}
			const updated = await airtable.update(TABLES.submissions, submission.id, changes);
			submission.fields = updated.fields;
		}

		// Edits the original confirmation reply in place instead of spamming a new one each refresh.
		const replyMessageTs = primary.fields[F.submissions.replyMessageTs];
		if (
			replyMessageTs &&
			primary.fields[F.submissions.countedTowardStreak] &&
			!primary.fields[F.submissions.messageDeletedAt] &&
			replyStatsBefore !== replyStats
		) {
			try {
				const text = messages.streakUpdate(
					primary.fields[F.submissions.streakAtPost] ?? 0,
					primary.fields[F.submissions.freezesAtPost] ?? 0,
					combineStats(fetched)
				);
				await slack.updateMessage(primary.fields[F.submissions.channelId], replyMessageTs, text);
			} catch (err) {
				console.error('failed to update submission reply with fresh stats', err);
			}
		}

		const milestone = viewMilestoneCrossed(viewsBefore, totalViews(rows));
		if (milestone) {
			try {
				const announceChannelId = requireEnv('SLACK_ANNOUNCE_CHANNEL_ID', config.announceChannelId);
				await slack.postMessage(
					announceChannelId,
					messages.viewMilestoneAnnounce(
						primary.fields[F.submissions.slackId],
						primary.fields[F.submissions.url],
						milestone
					)
				);
			} catch (err) {
				console.error('view milestone announce failed', err);
			}
		}
	}

	// Only ever sets the flag; an admin dismissing it is what stops it coming back.
	const repeats = await findRepeats(submissions, new Date().toISOString().slice(0, 10), (id) =>
		unified.fetchScreenplay(id)
	);
	for (const [id, { of, reason }] of repeats) {
		const submission = submissions.find((s) => s.id === id);
		if (!submission) continue;
		const updated = await airtable.update(TABLES.submissions, id, {
			[F.submissions.repeatOf]: of.fields[F.submissions.url],
			[F.submissions.repeatReason]: reason
		});
		submission.fields = updated.fields;
	}

	return { viewsChecked, repeatsFlagged: repeats.size, submissions };
}

// Hourly, matching how often unified-socials captures new counts. Totals are resynced so the
// site's view boards move between nightly leaderboards too.
export async function runViews() {
	const { viewsChecked, repeatsFlagged, submissions } = await refreshViews();
	const participants = await airtable.list(TABLES.participants, {
		filterByFormula: PARTICIPANT_HAS_SLACK_ID
	});
	await syncTotalViews(participants, submissions);
	return { viewsChecked, repeatsFlagged };
}

const PREVIEW_WINDOW_DAYS = 2;

// Every few minutes, and only for recent videos still without a thumbnail, so a new post shows up
// properly well before the hourly views run. Older rows are left to that run.
export async function runPreviews() {
	const submissions = await airtable.list(TABLES.submissions, {
		filterByFormula: `AND(${SUBMISSION_NOT_DELETED}, {${F.submissions.thumbnailUrl}} = BLANK(), IS_AFTER({${F.submissions.postedAt}}, DATEADD(NOW(), -${PREVIEW_WINDOW_DAYS}, 'days')))`
	});
	let filled = 0;
	/** @type {Set<string>} */
	const viewsChanged = new Set();

	for (const submission of submissions) {
		const fields = submission.fields;
		const video = { platform: fields[F.submissions.platform], url: fields[F.submissions.url] };
		let post = null;
		try {
			post = await unified.fetchPostByPlatformId(video.platform, fields[F.submissions.videoId]);
		} catch (err) {
			console.error('unified-socials preview fetch failed', err);
		}
		/** @type {Record<string, unknown>} */
		const changes = post ? postFields(post) : {};
		Object.assign(changes, await previewFields(video, { ...fields, ...changes }));
		if (!changes[F.submissions.thumbnailUrl]) continue;

		await airtable.update(TABLES.submissions, submission.id, changes);
		if (post) viewsChanged.add(fields[F.submissions.slackId]);
		filled++;
	}

	for (const slackId of viewsChanged) {
		const participant = await findParticipant(slackId);
		if (participant) await syncParticipantTotalViews(participant);
	}
	return { checked: submissions.length, filled };
}

const BOARD_SIZE = 10;

/**
 * @param {AirtableRecord[]} records
 * @param {string} field
 */
function topBy(records, field) {
	return [...records]
		.sort((a, b) => (b.fields[field] ?? 0) - (a.fields[field] ?? 0))
		.slice(0, BOARD_SIZE);
}

/**
 * @param {AirtableRecord[]} records
 * @param {(record: AirtableRecord) => string} line
 */
function numbered(records, line) {
	return records.map((record, i) => `${i + 1}. ${line(record)}`).join('\n');
}

const REMINDER_HOUR = 20;
const LEADERBOARD_HOUR = 21;
const LEADERBOARD_TZ = 'America/New_York';

// Refreshes every submission's stats first so the boards reflect tonight's numbers. The cron can
// fire more often than daily: without force it only posts at 9pm Eastern once submissions open.
/** @param {{ force?: boolean }} [options] */
export async function runLeaderboard({ force = false } = {}) {
	if (!force && (!config.submissionsOpen || localHour(LEADERBOARD_TZ) !== LEADERBOARD_HOUR)) {
		return { skipped: true };
	}
	const { viewsChecked, submissions } = await refreshViews();
	const participants = await airtable.list(TABLES.participants, {
		filterByFormula: PARTICIPANT_HAS_SLACK_ID
	});
	await syncTotalViews(participants, submissions);

	const byStreak = [...participants].sort(compareStreaks).slice(0, BOARD_SIZE);
	const byViews = topBy(participants, F.participants.totalViews);
	const byVideo = groupByVideo(submissions)
		.sort((a, b) => b.views - a.views)
		.slice(0, BOARD_SIZE);

	const streakLines = numbered(
		byStreak,
		(p) =>
			`<@${p.fields[F.participants.slackId]}> · ${p.fields[F.participants.currentStreak] ?? 0} days`
	);

	const viewLines = numbered(
		byViews,
		(p) => `<@${p.fields[F.participants.slackId]}> · ${p.fields[F.participants.totalViews] ?? 0} views`
	);

	const videoLines = byVideo
		.map(({ primary: s, views }, i) => {
			const label = s.fields[F.submissions.title] || s.fields[F.submissions.platform];
			return `${i + 1}. <${s.fields[F.submissions.url]}|${label}> by <@${s.fields[F.submissions.slackId]}> · ${views} views`;
		})
		.join('\n');

	const announceChannelId = requireEnv('SLACK_ANNOUNCE_CHANNEL_ID', config.announceChannelId);
	await slack.postMessage(announceChannelId, `*Longest active streaks*\n${streakLines}`);
	await slack.postMessage(announceChannelId, `*Most total views*\n${viewLines}`);
	await slack.postMessage(announceChannelId, `*Highest viewed videos*\n${videoLines}`);

	// The board posts once a day, so "today" is anyone whose milestone landed in the last 24 hours.
	const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
	const unlocked = participants.filter(
		(p) => Date.parse(p.fields[F.participants.lastMilestoneAt] ?? '') > dayAgo
	);
	if (unlocked.length) {
		const lines = unlocked
			.map((p) => {
				const milestone = p.fields[F.participants.lastMilestone];
				return `<@${p.fields[F.participants.slackId]}> · ${milestone}-day prize (${prizeFor(milestone)})`;
			})
			.join('\n');
		await slack.postMessage(announceChannelId, `*Prizes unlocked today* 🎉\n${lines}`);
	}

	return {
		viewsChecked,
		streakEntries: byStreak.length,
		viewEntries: byViews.length,
		videoEntries: byVideo.length,
		prizesUnlocked: unlocked.length
	};
}

/** @param {string | undefined} tz */
function localHour(tz) {
	return Number(
		new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz || 'America/New_York' }).format(new Date())
	);
}

// force reminds everyone with a slack_id regardless of hour/streak/posted-today/already-reminded,
// and never writes last_reminder_day — for the admin panel's test button. The real hourly cron
// always calls this with no args.
/** @param {{ force?: boolean }} [options] */
export async function runRemind({ force = false } = {}) {
	if (!force && !config.submissionsOpen) return { sent: 0 };

	const participants = await airtable.list(TABLES.participants, {
		filterByFormula: force
			? PARTICIPANT_HAS_SLACK_ID
			: `AND(${PARTICIPANT_HAS_SLACK_ID}, {${F.participants.currentStreak}} >= 1, NOT({${F.participants.remindersOff}}))`
	});

	let sent = 0;
	for (const participant of participants) {
		const slackId = participant.fields[F.participants.slackId];
		const today = streakDay(participant.fields[F.participants.tz]);
		if (!force && participant.fields[F.participants.lastDay] === today) continue;
		if (!force && participant.fields[F.participants.lastReminderDay] === today) continue;
		if (!force && localHour(participant.fields[F.participants.tz]) !== REMINDER_HOUR) continue;

		const text = messages.reminder();
		await slack.dm(slackId, text, messages.reminderBlocks(text, true));
		if (!force) {
			await airtable.update(TABLES.participants, participant.id, {
				[F.participants.lastReminderDay]: today
			});
		}
		sent++;
	}

	return { sent };
}

const BACKUPS_KEPT = 24 * 30;

// Snapshots every table of both environments into one timestamped JSON file, keeping 30 days.
export async function runBackup() {
	const tables = [
		...Object.values(tablesFor('prod')),
		...Object.values(tablesFor('dev')),
		shippingTableFor('prod'),
		shippingTableFor('dev')
	];
	/** @type {Record<string, AirtableRecord[]>} */
	const snapshot = {};
	for (const table of tables) snapshot[table] = await airtable.list(table);

	const now = new Date().toISOString();
	const file = `airtable_${now.slice(2, 10)}_${now.slice(11, 13)}${now.slice(14, 16)}.json`;
	await mkdir(config.backupDir, { recursive: true });
	await writeFile(
		path.join(config.backupDir, file),
		JSON.stringify({ takenAt: now, tables: snapshot })
	);

	const backups = (await readdir(config.backupDir))
		.filter((name) => /^airtable_.*\.json$/.test(name))
		.sort();
	const stale = backups.slice(0, Math.max(0, backups.length - BACKUPS_KEPT));
	for (const name of stale) await rm(path.join(config.backupDir, name));

	return {
		file,
		records: Object.values(snapshot).reduce((sum, records) => sum + records.length, 0),
		pruned: stale.length
	};
}
