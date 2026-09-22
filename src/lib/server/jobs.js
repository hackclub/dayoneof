// Shared job bodies behind /api/cron/* — one implementation per job, reused by the admin panel.
import { config, requireEnv, TABLES, F, PARTICIPANT_HAS_SLACK_ID } from './config.js';
import * as airtable from './airtable.js';
import * as slack from './slack.js';
import * as unified from './unified.js';
import { messages } from './messages.js';
import { resolveMissedDay } from './streak.js';

function yesterday() {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}

// Sums a participant's stored submissions.views fresh from Airtable, rather than incrementing,
// so it stays correct regardless of which fetches succeed on any given run.
/** @param {string} slackId */
export async function syncParticipantTotalViews(slackId) {
	const submissions = await airtable.list(TABLES.submissions, {
		filterByFormula: airtable.eq(F.submissions.slackId, slackId)
	});
	const total = submissions.reduce((sum, s) => sum + (s.fields[F.submissions.views] ?? 0), 0);
	await airtable.upsert(TABLES.participants, airtable.eq(F.participants.slackId, slackId), {
		[F.participants.totalViews]: total
	});
	return total;
}

export async function runReconcile() {
	const date = yesterday();
	const participants = await airtable.list(TABLES.participants, {
		filterByFormula: `AND(${PARTICIPANT_HAS_SLACK_ID}, OR({${F.participants.status}} = "active", {${F.participants.status}} = "frozen"))`
	});
	const days = await airtable.list(TABLES.days, {
		filterByFormula: airtable.eq(F.days.date, date)
	});
	const postedBySlackId = new Set(days.map((d) => d.fields[F.days.slackId]));

	// A participant with no days row before yesterday just signed up today — nothing to reconcile.
	const priorDays = await airtable.list(TABLES.days, {
		filterByFormula: `{${F.days.date}} < "${date}"`
	});
	const hasHistoryBeforeYesterday = new Set(priorDays.map((d) => d.fields[F.days.slackId]));

	let frozen = 0;
	let broken = 0;

	for (const participant of participants) {
		const slackId = participant.fields[F.participants.slackId];
		if (postedBySlackId.has(slackId)) continue;
		if (!hasHistoryBeforeYesterday.has(slackId)) continue;

		const freezesAvailable = participant.fields[F.participants.streakFreezes] ?? 0;
		const { status, freezesRemaining, broke } = resolveMissedDay(freezesAvailable);
		if (broke) broken++;
		else frozen++;

		await airtable.create(TABLES.days, {
			[F.days.slackId]: slackId,
			[F.days.date]: date,
			[F.days.status]: status
		});

		await airtable.update(TABLES.participants, participant.id, {
			[F.participants.streakFreezes]: freezesRemaining,
			[F.participants.status]: broke ? 'broken' : 'frozen',
			[F.participants.currentStreak]: broke ? 0 : participant.fields[F.participants.currentStreak]
		});

		try {
			await slack.dm(slackId, broke ? messages.streakBroken() : messages.dayFrozen(freezesRemaining));
		} catch (err) {
			console.error('reconcile dm failed', err);
		}
	}

	const views = await refreshViews();

	return { processed: participants.length, frozen, broken, ...views };
}

async function refreshViews() {
	const submissions = await airtable.list(TABLES.submissions, {
		filterByFormula: `NOT({${F.submissions.videoId}} = "")`
	});
	if (submissions.length === 0) return { viewsChecked: 0 };

	let viewsChecked = 0;
	const slackIds = new Set();

	for (const submission of submissions) {
		const platform = submission.fields[F.submissions.platform];
		const videoId = submission.fields[F.submissions.videoId];
		if (!platform || !videoId) continue;
		slackIds.add(submission.fields[F.submissions.slackId]);

		let post;
		try {
			post = await unified.fetchPostByPlatformId(platform, videoId);
		} catch (err) {
			console.error('unified-socials views fetch failed', err);
			continue;
		}
		if (!post) continue;
		viewsChecked++;

		await airtable.update(TABLES.submissions, submission.id, {
			[F.submissions.views]: post.views,
			[F.submissions.title]: post.title,
			[F.submissions.thumbnailUrl]: post.thumbnailUrl,
			[F.submissions.archiveUrl]: post.archiveUrl,
			[F.submissions.unifiedId]: String(post.id)
		});

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

	for (const slackId of slackIds) {
		await syncParticipantTotalViews(slackId);
	}

	return { viewsChecked };
}

const BOARD_SIZE = 10;

/** @typedef {import('./airtable.js').AirtableRecord} AirtableRecord */

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

export async function runLeaderboard() {
	const [participants, submissions] = await Promise.all([
		airtable.list(TABLES.participants, { filterByFormula: PARTICIPANT_HAS_SLACK_ID }),
		airtable.list(TABLES.submissions)
	]);

	// Fewer freezes banked wins the tie: the same streak kept with less cover is the better run.
	const byStreak = [...participants]
		.sort(
			(a, b) =>
				(b.fields[F.participants.currentStreak] ?? 0) -
					(a.fields[F.participants.currentStreak] ?? 0) ||
				(a.fields[F.participants.streakFreezes] ?? 0) - (b.fields[F.participants.streakFreezes] ?? 0)
		)
		.slice(0, BOARD_SIZE);
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

	return { streakEntries: byStreak.length, viewEntries: byViews.length, videoEntries: byVideo.length };
}

/** @param {string | undefined} tz */
function localHour(tz) {
	return Number(
		new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz ?? 'UTC' }).format(new Date())
	);
}

// force reminds everyone with a slack_id regardless of hour/posted-today/already-reminded, and
// never writes last_reminder_day — for the admin panel's test button. The real hourly cron
// always calls this with no args.
/** @param {{ force?: boolean }} [options] */
export async function runRemind({ force = false } = {}) {
	const today = new Date().toISOString().slice(0, 10);
	const participants = await airtable.list(TABLES.participants, {
		filterByFormula: force
			? PARTICIPANT_HAS_SLACK_ID
			: `AND(${PARTICIPANT_HAS_SLACK_ID}, NOT({${F.participants.reminderHour}} = ""))`
	});
	const daysToday = await airtable.list(TABLES.days, {
		filterByFormula: airtable.eq(F.days.date, today)
	});
	const postedToday = new Set(daysToday.map((d) => d.fields[F.days.slackId]));

	let sent = 0;
	for (const participant of participants) {
		const slackId = participant.fields[F.participants.slackId];
		if (!force && postedToday.has(slackId)) continue;
		if (!force && participant.fields[F.participants.lastReminderDay] === today) continue;
		if (!force && localHour(participant.fields[F.participants.tz]) !== participant.fields[F.participants.reminderHour]) continue;

		await slack.dm(slackId, messages.reminder());
		if (!force) {
			await airtable.update(TABLES.participants, participant.id, {
				[F.participants.lastReminderDay]: today
			});
		}
		sent++;
	}

	return { sent };
}
