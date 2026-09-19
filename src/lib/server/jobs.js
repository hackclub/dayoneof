// Shared job bodies behind /api/cron/* and the Slack `debug` commands (see
// src/routes/api/slack/events/+server.js) — one implementation, two triggers.
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

export async function runReconcile() {
	const date = yesterday();
	const participants = await airtable.list(TABLES.participants, {
		filterByFormula: `AND(${PARTICIPANT_HAS_SLACK_ID}, OR({${F.participants.status}} = "active", {${F.participants.status}} = "frozen"))`
	});
	const days = await airtable.list(TABLES.days, { filterByFormula: `{${F.days.date}} = "${date}"` });
	const postedBySlackId = new Set(days.map((d) => d.fields[F.days.slackId]));

	// Someone whose first-ever activity is today has no days row before yesterday — without
	// this check they'd be treated as having missed a day that predates their own sign-up.
	const priorDays = await airtable.list(TABLES.days, { filterByFormula: `{${F.days.date}} < "${date}"` });
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

// Looks each submission up by (platform, video_id) — see the caveats in
// src/lib/server/unified.js about how confirmed this read path actually is.
async function refreshViews() {
	const submissions = await airtable.list(TABLES.submissions, {
		filterByFormula: `NOT({${F.submissions.videoId}} = "")`
	});
	if (submissions.length === 0) return { viewsChecked: 0 };

	const totalsBySlackId = new Map();
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

		await airtable.update(TABLES.submissions, submission.id, {
			[F.submissions.views]: post.views,
			[F.submissions.likes]: post.likes,
			[F.submissions.unifiedId]: String(post.id)
		});

		// Edit the original confirmation reply in place with fresh stats, rather than posting a
		// new message into the thread every run. streak_at_post/freezes_at_post were captured
		// once at submit time so the rest of the message stays historically accurate.
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

		const slackId = submission.fields[F.submissions.slackId];
		totalsBySlackId.set(slackId, (totalsBySlackId.get(slackId) ?? 0) + post.views);
	}

	for (const [slackId, total] of totalsBySlackId) {
		await airtable.upsert(TABLES.participants, `{${F.participants.slackId}} = "${slackId}"`, {
			[F.participants.totalViews]: total
		});
	}

	return { viewsChecked };
}

export async function runLeaderboard() {
	const participants = await airtable.list(TABLES.participants, {
		filterByFormula: PARTICIPANT_HAS_SLACK_ID
	});

	const byStreak = [...participants]
		.sort((a, b) => {
			const streakDiff =
				(b.fields[F.participants.currentStreak] ?? 0) - (a.fields[F.participants.currentStreak] ?? 0);
			if (streakDiff !== 0) return streakDiff;
			return (a.fields[F.participants.streakFreezes] ?? 0) - (b.fields[F.participants.streakFreezes] ?? 0);
		})
		.slice(0, 10);

	const byViews = [...participants]
		.sort((a, b) => (b.fields[F.participants.totalViews] ?? 0) - (a.fields[F.participants.totalViews] ?? 0))
		.slice(0, 10);

	const streakLines = byStreak
		.map((p, i) => `${i + 1}. <@${p.fields[F.participants.slackId]}> — ${p.fields[F.participants.currentStreak] ?? 0} days`)
		.join('\n');

	const viewLines = byViews
		.map((p, i) => `${i + 1}. <@${p.fields[F.participants.slackId]}> — ${p.fields[F.participants.totalViews] ?? 0} views`)
		.join('\n');

	const announceChannelId = requireEnv('SLACK_ANNOUNCE_CHANNEL_ID', config.announceChannelId);
	await slack.postMessage(announceChannelId, `*Longest active streaks*\n${streakLines}`);
	await slack.postMessage(announceChannelId, `*Most total views*\n${viewLines}`);

	return { streakEntries: byStreak.length, viewEntries: byViews.length };
}

function localHour(/** @type {string | undefined} */ tz) {
	return Number(
		new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz ?? 'UTC' }).format(new Date())
	);
}

/**
 * @param {{ force?: boolean }} [options] `force` DMs literally everyone with a slack_id —
 * ignoring reminder hour, whether they posted today, and whether they were already reminded
 * today — and never writes `last_reminder_day` (so it has zero effect on the real reminder
 * system). For admin testing only; the real hourly cron always calls `runRemind()` with no args.
 */
export async function runRemind({ force = false } = {}) {
	const today = new Date().toISOString().slice(0, 10);
	const participants = await airtable.list(TABLES.participants, {
		filterByFormula: force
			? PARTICIPANT_HAS_SLACK_ID
			: `AND(${PARTICIPANT_HAS_SLACK_ID}, NOT({${F.participants.reminderHour}} = ""))`
	});
	const daysToday = await airtable.list(TABLES.days, { filterByFormula: `{${F.days.date}} = "${today}"` });
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
