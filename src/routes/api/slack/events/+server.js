import { createHmac, timingSafeEqual } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { config, requireEnv, TABLES, F } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import * as slack from '$lib/server/slack.js';
// unified-socials write is disabled — see src/lib/server/unified.js
// import * as unified from '$lib/server/unified.js';
import { extractLink } from '$lib/server/links.js';
import { messages } from '$lib/server/messages.js';
import {
	utcDateString,
	isDuplicatePost,
	computeStreak,
	daysCompletedCount,
	freezesEarned,
	nextMilestone
} from '$lib/server/streak.js';

/**
 * @typedef {{
 *   type: string,
 *   subtype?: string,
 *   bot_id?: string,
 *   channel: string,
 *   user: string,
 *   text: string,
 *   ts: string,
 *   thread_ts?: string,
 *   permalink?: string
 * }} SlackEvent
 */

/**
 * @param {string} rawBody
 * @param {string | null} timestamp
 * @param {string | null} signature
 */
function verifySignature(rawBody, timestamp, signature) {
	if (!timestamp || !signature) return false;
	if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 * 5) return false;
	const base = `v0:${timestamp}:${rawBody}`;
	const secret = requireEnv('SLACK_SIGNING_SECRET', config.slackSigningSecret);
	const expected = `v0=${createHmac('sha256', secret).update(base).digest('hex')}`;
	const a = Buffer.from(signature);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

/** @param {string} slackId */
async function getDays(slackId) {
	const records = await airtable.list(TABLES.days, {
		filterByFormula: `{${F.days.slackId}} = "${slackId}"`
	});
	return records.map((r) => ({ date: r.fields[F.days.date], status: r.fields[F.days.status] }));
}

/** @param {string} slackId */
async function getOrCreateParticipant(slackId) {
	const existing = await airtable.find(TABLES.participants, `{${F.participants.slackId}} = "${slackId}"`);
	if (existing) return existing;
	const user = await slack.usersInfo(slackId);
	return airtable.create(TABLES.participants, {
		[F.participants.slackId]: slackId,
		[F.participants.name]: user.real_name,
		[F.participants.email]: user.profile?.email,
		[F.participants.tz]: user.tz,
		[F.participants.status]: 'active',
		[F.participants.streakFreezes]: 0,
		[F.participants.daysCompleted]: 0
	});
}

/** @param {SlackEvent} event */
async function handleSubmission(event) {
	const link = extractLink(event.text);
	if (!link) {
		await slack.addReaction(event.channel, event.ts, 'question');
		await slack.postEphemeral(event.channel, event.user, messages.unsupportedLink());
		return;
	}

	const today = utcDateString();
	const days = await getDays(event.user);

	if (isDuplicatePost(days, today)) {
		await slack.addReaction(event.channel, event.ts, 'repeat');
		await airtable.create(TABLES.submissions, {
			[F.submissions.slackId]: event.user,
			[F.submissions.url]: link.url,
			[F.submissions.platform]: link.platform,
			[F.submissions.videoId]: link.videoId,
			[F.submissions.postedAt]: new Date().toISOString(),
			[F.submissions.day]: today,
			[F.submissions.countedTowardStreak]: false,
			[F.submissions.channelId]: event.channel,
			[F.submissions.messageTs]: event.ts
		});
		return;
	}

	const participant = await getOrCreateParticipant(event.user);
	await airtable.create(TABLES.days, {
		[F.days.slackId]: event.user,
		[F.days.date]: today,
		[F.days.status]: 'posted'
	});

	const submission = await airtable.create(TABLES.submissions, {
		[F.submissions.slackId]: event.user,
		[F.submissions.url]: link.url,
		[F.submissions.platform]: link.platform,
		[F.submissions.videoId]: link.videoId,
		[F.submissions.postedAt]: new Date().toISOString(),
		[F.submissions.day]: today,
		[F.submissions.countedTowardStreak]: true,
		[F.submissions.channelId]: event.channel,
		[F.submissions.messageTs]: event.ts,
		[F.submissions.permalink]: event.permalink
	});

	const updatedDays = [...days, { date: today, status: 'posted' }];
	const streak = computeStreak(updatedDays);
	const completed = daysCompletedCount(updatedDays);
	const freezes = freezesEarned(completed);

	await airtable.update(TABLES.participants, participant.id, {
		[F.participants.daysCompleted]: completed,
		[F.participants.streakFreezes]: freezes,
		[F.participants.currentStreak]: streak,
		[F.participants.status]: 'active'
	});

	await slack.addReaction(event.channel, event.ts, 'white_check_mark');
	await slack.postMessage(event.channel, messages.streakUpdate(streak, freezes), event.ts);

	const milestone = nextMilestone(streak, participant.fields[F.participants.lastMilestone]);
	if (milestone) {
		const announceChannelId = requireEnv('SLACK_ANNOUNCE_CHANNEL_ID', config.announceChannelId);
		await slack.postMessage(announceChannelId, messages.milestoneAnnounce(event.user, milestone));
		await slack.dm(event.user, messages.milestoneDm(milestone));
		await airtable.update(TABLES.participants, participant.id, {
			[F.participants.lastMilestone]: milestone
		});
	}

	// unified-socials handoff is disabled — no confirmed write endpoint exists (see
	// src/lib/server/unified.js). Views get matched up nightly by (platform, video_id) in the
	// reconcile cron instead, which doesn't need a submit-time id at all.
	// try {
	// 	const unifiedId = await unified.submitPost({ url: link.url, platform: link.platform, slackId: event.user });
	// 	await airtable.update(TABLES.submissions, submission.id, { [F.submissions.unifiedId]: unifiedId });
	// } catch (err) {
	// 	console.error('unified-socials handoff failed', err);
	// }
}

/** @param {SlackEvent} event */
async function handleThreadReply(event) {
	if (!event.text || event.text.length < config.minReviewLength) return;

	const submission = await airtable.find(
		TABLES.submissions,
		`{${F.submissions.messageTs}} = "${event.thread_ts}"`
	);
	if (!submission || submission.fields[F.submissions.slackId] === event.user) return;

	await airtable.create(TABLES.reviews, {
		[F.reviews.submissionId]: submission.fields[F.submissions.submissionId] ?? submission.id,
		[F.reviews.reviewerId]: event.user,
		[F.reviews.reviewedAt]: new Date().toISOString(),
		[F.reviews.messageTs]: event.ts,
		[F.reviews.length]: event.text.length,
		[F.reviews.text]: event.text
	});

	await airtable.update(TABLES.submissions, submission.id, {
		[F.submissions.reviewCount]: (submission.fields[F.submissions.reviewCount] ?? 0) + 1
	});
	await slack.addReaction(event.channel, event.ts, 'eyes');
}

/** @param {SlackEvent} event */
async function handleAppMention(event) {
	const text = event.text.replace(/<@\w+>/, '').trim();
	const [command, arg] = text.split(/\s+/);

	if (command === 'status') {
		const participant = await airtable.find(
			TABLES.participants,
			`{${F.participants.slackId}} = "${event.user}"`
		);
		const days = await getDays(event.user);
		const streak = computeStreak(days);
		const freezes = participant?.fields[F.participants.streakFreezes] ?? 0;
		const completed = participant?.fields[F.participants.daysCompleted] ?? 0;
		await slack.postMessage(event.channel, messages.status(streak, freezes, completed), event.ts);
		return;
	}

	if (command === 'remind') {
		const hour = Number(arg);
		if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
			await slack.postMessage(event.channel, messages.remindUsage(), event.ts);
			return;
		}
		await airtable.upsert(TABLES.participants, `{${F.participants.slackId}} = "${event.user}"`, {
			[F.participants.slackId]: event.user,
			[F.participants.reminderHour]: hour
		});
		await slack.postMessage(event.channel, messages.remindSet(hour), event.ts);
		return;
	}

	if (command === 'reviews') {
		const reviews = await airtable.list(TABLES.reviews, {
			filterByFormula: `{${F.reviews.reviewerId}} = "${event.user}"`
		});
		await slack.postMessage(event.channel, `You've left ${reviews.length} reviews.`, event.ts);
	}
}

/** @param {SlackEvent} [event] */
async function handleEvent(event) {
	if (!event) return;
	if (event.type === 'app_mention') return handleAppMention(event);
	if (event.type === 'message' && event.channel === config.submissionChannelId) {
		if (event.subtype || event.bot_id) return;
		if (event.thread_ts && event.thread_ts !== event.ts) return handleThreadReply(event);
		return handleSubmission(event);
	}
}

export async function POST({ request }) {
	const rawBody = await request.text();
	const signature = request.headers.get('x-slack-signature');
	const timestamp = request.headers.get('x-slack-request-timestamp');

	if (!verifySignature(rawBody, timestamp, signature)) {
		return json({ error: 'invalid signature' }, { status: 401 });
	}

	const body = JSON.parse(rawBody);

	if (body.type === 'url_verification') {
		return json({ challenge: body.challenge });
	}

	if (request.headers.get('x-slack-retry-num')) {
		return json({ ok: true });
	}

	try {
		await handleEvent(body.event);
	} catch (err) {
		console.error('slack event handling failed', err);
	}

	return json({ ok: true });
}
