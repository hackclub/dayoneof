// Shared job bodies behind /api/cron/* and the Slack `debug` commands (see
// src/routes/api/slack/events/+server.js) — one implementation, two triggers.
import { config, requireEnv, TABLES, F } from './config.js';
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
		filterByFormula: `OR({${F.participants.status}} = "active", {${F.participants.status}} = "frozen")`
	});
	const days = await airtable.list(TABLES.days, { filterByFormula: `{${F.days.date}} = "${date}"` });
	const postedBySlackId = new Set(days.map((d) => d.fields[F.days.slackId]));

	let frozen = 0;
	let broken = 0;

	for (const participant of participants) {
		const slackId = participant.fields[F.participants.slackId];
		if (postedBySlackId.has(slackId)) continue;

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
			[F.submissions.unifiedId]: String(post.id)
		});

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
	const participants = await airtable.list(TABLES.participants);

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

export async function runRemind() {
	const today = new Date().toISOString().slice(0, 10);
	const participants = await airtable.list(TABLES.participants, {
		filterByFormula: `NOT({${F.participants.reminderHour}} = "")`
	});
	const daysToday = await airtable.list(TABLES.days, { filterByFormula: `{${F.days.date}} = "${today}"` });
	const postedToday = new Set(daysToday.map((d) => d.fields[F.days.slackId]));

	let sent = 0;
	for (const participant of participants) {
		const slackId = participant.fields[F.participants.slackId];
		if (postedToday.has(slackId)) continue;
		if (participant.fields[F.participants.lastReminderDay] === today) continue;
		if (localHour(participant.fields[F.participants.tz]) !== participant.fields[F.participants.reminderHour]) continue;

		await slack.dm(slackId, messages.reminder());
		await airtable.update(TABLES.participants, participant.id, {
			[F.participants.lastReminderDay]: today
		});
		sent++;
	}

	return { sent };
}
