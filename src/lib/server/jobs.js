// Shared job bodies behind /api/cron/* — one implementation per job, reused by the admin panel.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config, requireEnv, TABLES, F, PARTICIPANT_HAS_SLACK_ID } from './config.js';
import { tablesFor } from './schema.js';
import * as airtable from './airtable.js';
import * as slack from './slack.js';
import * as unified from './unified.js';
import { messages } from './messages.js';
import { serialize } from './queue.js';
import { streakDay, addDays, settleMissedDays, compareStreaks } from './streak.js';

/** @typedef {import('./airtable.js').AirtableRecord} AirtableRecord */

// Re-sums stored submission views rather than incrementing, so a failed fetch never skews totals.
/** @param {AirtableRecord} participant */
export async function syncParticipantTotalViews(participant) {
	const submissions = await airtable.list(TABLES.submissions, {
		filterByFormula: airtable.eq(F.submissions.slackId, participant.fields[F.participants.slackId])
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

/** @returns {Promise<{ viewsChecked: number, submissions: AirtableRecord[] }>} */
async function refreshViews() {
	const submissions = await airtable.list(TABLES.submissions);
	let viewsChecked = 0;

	for (const submission of submissions) {
		const platform = submission.fields[F.submissions.platform];
		const videoId = submission.fields[F.submissions.videoId];
		if (!platform || !videoId) continue;

		let post;
		try {
			post = await unified.fetchPostByPlatformId(platform, videoId);
		} catch (err) {
			console.error('unified-socials views fetch failed', err);
			continue;
		}
		if (!post) continue;
		viewsChecked++;

		const fields = submission.fields;
		if (
			fields[F.submissions.views] === post.views &&
			fields[F.submissions.title] === post.title &&
			(fields[F.submissions.thumbnailUrl] ?? '') === post.thumbnailUrl &&
			(fields[F.submissions.archiveUrl] ?? '') === post.archiveUrl
		) {
			continue;
		}

		const updated = await airtable.update(TABLES.submissions, submission.id, {
			[F.submissions.views]: post.views,
			[F.submissions.title]: post.title,
			[F.submissions.thumbnailUrl]: post.thumbnailUrl,
			[F.submissions.archiveUrl]: post.archiveUrl,
			[F.submissions.unifiedId]: String(post.id)
		});
		submission.fields = updated.fields;

		// Edits the original confirmation reply in place instead of spamming a new one nightly.
		const replyMessageTs = submission.fields[F.submissions.replyMessageTs];
		if (replyMessageTs) {
			try {
				const text = messages.streakUpdate(
					submission.fields[F.submissions.streakAtPost] ?? 0,
					submission.fields[F.submissions.freezesAtPost] ?? 0,
					{ views: post.views, likes: post.likes }
				);
				await slack.updateMessage(submission.fields[F.submissions.channelId], replyMessageTs, text);
			} catch (err) {
				console.error('failed to update submission reply with fresh stats', err);
			}
		}
	}

	return { viewsChecked, submissions };
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
	const byVideo = topBy(submissions, F.submissions.views);

	const streakLines = numbered(
		byStreak,
		(p) =>
			`<@${p.fields[F.participants.slackId]}> · ${p.fields[F.participants.currentStreak] ?? 0} days`
	);

	const viewLines = numbered(
		byViews,
		(p) => `<@${p.fields[F.participants.slackId]}> · ${p.fields[F.participants.totalViews] ?? 0} views`
	);

	const videoLines = numbered(byVideo, (s) => {
		const label = s.fields[F.submissions.title] || s.fields[F.submissions.platform];
		const views = s.fields[F.submissions.views] ?? 0;
		return `<${s.fields[F.submissions.url]}|${label}> by <@${s.fields[F.submissions.slackId]}> · ${views} views`;
	});

	const announceChannelId = requireEnv('SLACK_ANNOUNCE_CHANNEL_ID', config.announceChannelId);
	await slack.postMessage(announceChannelId, `*Longest active streaks*\n${streakLines}`);
	await slack.postMessage(announceChannelId, `*Most total views*\n${viewLines}`);
	await slack.postMessage(announceChannelId, `*Highest viewed videos*\n${videoLines}`);

	return {
		viewsChecked,
		streakEntries: byStreak.length,
		viewEntries: byViews.length,
		videoEntries: byVideo.length
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
	const tables = [...Object.values(tablesFor('prod')), ...Object.values(tablesFor('dev'))];
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
