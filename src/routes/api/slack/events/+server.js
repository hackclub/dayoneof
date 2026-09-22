import { createHmac, timingSafeEqual } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { config, requireEnv, TABLES, F } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import * as slack from '$lib/server/slack.js';
import { fetchPostByPlatformId } from '$lib/server/unified.js';
import { extractLink } from '$lib/server/links.js';
import { messages } from '$lib/server/messages.js';
import { isHcaVerified } from '$lib/server/verification.js';
import { syncParticipantTotalViews } from '$lib/server/jobs.js';
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
 *   thread_ts?: string
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
		filterByFormula: airtable.eq(F.days.slackId, slackId)
	});
	return records.map((r) => ({ date: r.fields[F.days.date], status: r.fields[F.days.status] }));
}

// Participants only exist once they've signed in via HCA (src/routes/api/auth/callback) — never
// auto-created here.
/** @param {string} slackId */
async function getParticipant(slackId) {
	return airtable.find(TABLES.participants, airtable.eq(F.participants.slackId, slackId));
}

/** @param {SlackEvent} event */
async function handleSubmission(event) {
	const link = extractLink(event.text);
	if (!link) {
		await slack.addReaction(event.channel, event.ts, 'question');
		await slack.postMessage(event.channel, messages.unsupportedLink(event.user), event.ts);
		return;
	}

	const participant = await getParticipant(event.user);
	if (!participant) {
		await slack.addReaction(event.channel, event.ts, 'lock');
		await slack.postMessage(event.channel, messages.notSignedIn(event.user), event.ts);
		return;
	}
	if (!isHcaVerified(participant.fields[F.participants.verificationStatus])) {
		await slack.addReaction(event.channel, event.ts, 'lock');
		await slack.postMessage(
			event.channel,
			messages.notVerified(event.user, participant.fields[F.participants.verificationStatus]),
			event.ts
		);
		return;
	}

	const today = utcDateString();
	const days = await getDays(event.user);

	if (isDuplicatePost(days, today)) {
		await slack.addReaction(event.channel, event.ts, 'repeat');
		const duplicateSubmission = await airtable.create(TABLES.submissions, {
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

		const streak = computeStreak(days);
		const freezes = participant.fields[F.participants.streakFreezes] ?? 0;
		let stats = null;
		try {
			stats = await fetchPostByPlatformId(link.platform, link.videoId);
		} catch (err) {
			console.error('unified-socials stats lookup failed for duplicate post', err);
		}
		if (stats) {
			await airtable.update(TABLES.submissions, duplicateSubmission.id, {
				[F.submissions.views]: stats.views,
				[F.submissions.title]: stats.title,
				[F.submissions.thumbnailUrl]: stats.thumbnailUrl,
				[F.submissions.unifiedId]: String(stats.id)
			});
			await syncParticipantTotalViews(event.user);
		}
		await slack.postMessage(event.channel, messages.duplicatePost(event.user, streak, freezes, stats), event.ts);
		return;
	}

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
		[F.submissions.messageTs]: event.ts
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

	// Best-effort — the video was likely just posted and may not be tracked yet.
	let stats = null;
	try {
		stats = await fetchPostByPlatformId(link.platform, link.videoId);
	} catch (err) {
		console.error('unified-socials stats lookup failed at submission time', err);
	}

	// Written before attempting to react/reply so a Slack API failure below (rate limit, etc.)
	// can never leave the streak recorded but views/site data missing.
	await airtable.update(TABLES.submissions, submission.id, {
		[F.submissions.streakAtPost]: streak,
		[F.submissions.freezesAtPost]: freezes,
		...(stats
			? {
					[F.submissions.views]: stats.views,
					[F.submissions.title]: stats.title,
					[F.submissions.thumbnailUrl]: stats.thumbnailUrl,
					[F.submissions.unifiedId]: String(stats.id)
				}
			: {})
	});
	if (stats) await syncParticipantTotalViews(event.user);

	try {
		await slack.addReaction(event.channel, event.ts, 'white_check_mark');
		const reply = await slack.postMessage(event.channel, messages.streakUpdate(streak, freezes, stats), event.ts);
		// Lets reconcile edit this same message with fresh stats later instead of posting a new one.
		await airtable.update(TABLES.submissions, submission.id, { [F.submissions.replyMessageTs]: reply.ts });
	} catch (err) {
		console.error('react/reply to submission failed', event.channel, event.ts, err);
	}

	const milestone = nextMilestone(streak, participant.fields[F.participants.lastMilestone]);
	if (milestone) {
		const announceChannelId = requireEnv('SLACK_ANNOUNCE_CHANNEL_ID', config.announceChannelId);
		await slack.postMessage(announceChannelId, messages.milestoneAnnounce(event.user, milestone));
		await slack.dm(event.user, messages.milestoneDm(milestone));
		await airtable.update(TABLES.participants, participant.id, {
			[F.participants.lastMilestone]: milestone
		});
	}
}

/** @param {SlackEvent} event */
async function handleThreadReply(event) {
	if (!event.text || event.text.length < config.minReviewLength) return;

	const submission = await airtable.find(
		TABLES.submissions,
		airtable.eq(F.submissions.messageTs, event.thread_ts ?? '')
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
		const participant = await getParticipant(event.user);
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
		const participant = await getParticipant(event.user);
		if (!participant) {
			await slack.postMessage(event.channel, messages.notSignedIn(event.user), event.ts);
			return;
		}
		await airtable.update(TABLES.participants, participant.id, {
			[F.participants.reminderHour]: hour
		});
		await slack.postMessage(event.channel, messages.remindSet(hour), event.ts);
		return;
	}

	if (command === 'reviews') {
		const reviews = await airtable.list(TABLES.reviews, {
			filterByFormula: airtable.eq(F.reviews.reviewerId, event.user)
		});
		await slack.postMessage(event.channel, `You've left ${reviews.length} reviews.`, event.ts);
		return;
	}
}

// Cached across requests — the bot's own id never changes for a given token.
/** @type {string | undefined} */
let botUserId;

// Greets the channel when the bot itself is invited; every other member joining is ignored.
/** @param {SlackEvent} event */
async function handleMemberJoined(event) {
	if (!botUserId) {
		const auth = await slack.authTest();
		botUserId = auth.user_id;
	}
	if (event.user !== botUserId) return;
	await slack.postMessage(event.channel, 'dayoneof bot is here!');
}

/** @param {SlackEvent} [event] */
async function handleEvent(event) {
	if (!event) return;

	if (event.type === 'app_mention') return handleAppMention(event);
	if (event.type === 'member_joined_channel') return handleMemberJoined(event);

	if (event.type === 'message') {
		if (event.channel !== config.submissionChannelId) return;
		// Edits, joins and the bot's own replies all arrive here as message events.
		if (event.subtype || event.bot_id) return;
		if (event.thread_ts && event.thread_ts !== event.ts) return handleThreadReply(event);
		return handleSubmission(event);
	}
}

// Last resort when a handler threw: without this the poster sees no reaction and no reply and
// has no way to tell a broken submission from an ignored one. Swallows its own failure, since
// Slack is usually what's already broken by the time we get here.
/** @param {SlackEvent} [event] */
async function replyWithFailure(event) {
	if (!event?.channel || !event.user) return;
	try {
		await slack.postMessage(event.channel, messages.submissionFailed(event.user), event.ts);
	} catch (err) {
		console.error('failed to report failure back to slack', event.channel, event.ts, err);
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
		console.error('slack event handling failed', body.event?.channel, body.event?.ts, err);
		await replyWithFailure(body.event);
	}

	return json({ ok: true });
}
