import { createHmac, timingSafeEqual } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { config, requireEnv, isAdmin, TABLES, F } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import * as slack from '$lib/server/slack.js';
// unified-socials write is disabled — see src/lib/server/unified.js. The read path is used by
// the `debug stats` command below.
import { fetchPostByPlatformId } from '$lib/server/unified.js';
import { extractLink } from '$lib/server/links.js';
import { messages } from '$lib/server/messages.js';
import { isHcaVerified } from '$lib/server/verification.js';
import { runReconcile, runLeaderboard, runRemind } from '$lib/server/jobs.js';
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

// Participants are only ever created by the HCA sign-in flow (src/routes/api/auth/callback) —
// the bot no longer auto-creates one on first post, since a post only counts once someone has
// signed in and HCA has verified them. See handleSubmission's sign-in/verification gate below.
/** @param {string} slackId */
async function getParticipant(slackId) {
	return airtable.find(TABLES.participants, `{${F.participants.slackId}} = "${slackId}"`);
}

/** @param {SlackEvent} event */
async function handleSubmission(event) {
	const link = extractLink(event.text);
	if (!link) {
		await slack.addReaction(event.channel, event.ts, 'question');
		await slack.postEphemeral(event.channel, event.user, messages.unsupportedLink());
		return;
	}

	const participant = await getParticipant(event.user);
	if (!participant) {
		await slack.addReaction(event.channel, event.ts, 'lock');
		await slack.postEphemeral(event.channel, event.user, messages.notSignedIn());
		return;
	}
	if (!isHcaVerified(participant.fields[F.participants.verificationStatus])) {
		await slack.addReaction(event.channel, event.ts, 'lock');
		await slack.postEphemeral(event.channel, event.user, messages.notVerified(participant.fields[F.participants.verificationStatus]));
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
		return;
	}

	// === DEBUG COMMANDS — admin-only (config.js's ADMIN_SLACK_IDS). Delete this whole `if`
	// block (and the imports it's the only user of: isAdmin, fetchPostByPlatformId, runReconcile,
	// runLeaderboard, runRemind) before shipping to prod. ===================================
	if (command === 'debug') {
		if (!isAdmin(event.user)) {
			await slack.postEphemeral(event.channel, event.user, "You're not allowed to run debug commands.");
			return;
		}

		if (arg === 'reconcile') {
			const result = await runReconcile();
			await slack.postMessage(event.channel, `[debug] reconcile: ${JSON.stringify(result)}`, event.ts);
			return;
		}

		if (arg === 'leaderboard') {
			const result = await runLeaderboard();
			await slack.postMessage(event.channel, `[debug] leaderboard posted: ${JSON.stringify(result)}`, event.ts);
			return;
		}

		if (arg === 'remind') {
			const result = await runRemind();
			await slack.postMessage(event.channel, `[debug] remind: ${JSON.stringify(result)}`, event.ts);
			return;
		}

		if (arg === 'stats') {
			// Reply in-thread with a submission's live unified-socials stats, without waiting
			// for the nightly reconcile job. Use as a threaded reply under the submission.
			if (!event.thread_ts) {
				await slack.postMessage(event.channel, '[debug] reply to a submission thread to use `debug stats`', event.ts);
				return;
			}
			const submission = await airtable.find(
				TABLES.submissions,
				`{${F.submissions.messageTs}} = "${event.thread_ts}"`
			);
			if (!submission) {
				await slack.postMessage(event.channel, '[debug] no submission found for this thread', event.ts);
				return;
			}
			try {
				const post = await fetchPostByPlatformId(
					submission.fields[F.submissions.platform],
					submission.fields[F.submissions.videoId]
				);
				await slack.postMessage(
					event.channel,
					post
						? `[debug] unified-socials: views=${post.views} id=${post.id}`
						: '[debug] no unified-socials match for this video yet',
					event.ts
				);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				await slack.postMessage(event.channel, `[debug] unified-socials lookup failed: ${message}`, event.ts);
			}
			return;
		}

		await slack.postMessage(event.channel, '[debug] usage: `debug reconcile|leaderboard|remind|stats`', event.ts);
	}
	// === END DEBUG COMMANDS ===================================================================
}

// TESTER: fires when the bot itself is invited to a channel, independent of link-posting
// logic — a fast way to prove Slack is actually delivering events to this endpoint at all.
// Remove this (and the `member_joined_channel` subscription in Slack's app config) once
// you've confirmed the events pipeline works.
/** @type {string | undefined} */
let botUserId;

/** @param {SlackEvent} event */
async function handleMemberJoined(event) {
	if (!botUserId) {
		const auth = await slack.authTest();
		botUserId = auth.user_id;
	}
	if (event.user !== botUserId) return;
	console.log('[SLACKEVENT] bot was invited to', event.channel, '— posting test message');
	await slack.postMessage(event.channel, "👋 I'm in! If you're seeing this, event delivery works.");
}

/** @param {SlackEvent} [event] */
async function handleEvent(event) {
	// [SLACKEVENT] logs below show every inbound event and why it was (or wasn't) handled —
	// grep for that tag to strip them once the bot is behaving as expected.
	if (!event) {
		console.log('[SLACKEVENT] no event on payload, ignoring');
		return;
	}
	console.log('[SLACKEVENT]', event.type, 'channel=' + event.channel, 'subtype=' + event.subtype, 'bot_id=' + event.bot_id);

	if (event.type === 'app_mention') return handleAppMention(event);
	if (event.type === 'member_joined_channel') return handleMemberJoined(event);

	if (event.type === 'message') {
		if (event.channel !== config.submissionChannelId) {
			console.log('[SLACKEVENT] skipped: channel does not match SLACK_SUBMISSION_CHANNEL_ID', config.submissionChannelId);
			return;
		}
		if (event.subtype || event.bot_id) {
			console.log('[SLACKEVENT] skipped: has subtype/bot_id (likely a bot/edit/join message)');
			return;
		}
		if (event.thread_ts && event.thread_ts !== event.ts) return handleThreadReply(event);
		return handleSubmission(event);
	}
}

export async function POST({ request }) {
	const rawBody = await request.text();
	const signature = request.headers.get('x-slack-signature');
	const timestamp = request.headers.get('x-slack-request-timestamp');

	if (!verifySignature(rawBody, timestamp, signature)) {
		console.log('[SLACKEVENT] signature verification failed — check SLACK_SIGNING_SECRET');
		return json({ error: 'invalid signature' }, { status: 401 });
	}

	const body = JSON.parse(rawBody);
	console.log('[SLACKEVENT] received', body.type);

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
