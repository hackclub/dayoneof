import { json } from '@sveltejs/kit';
import {
	config,
	isAdmin,
	TABLES,
	F,
	SUBMISSION_NOT_DELETED,
	SUBMISSION_IS_PRIMARY
} from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import * as slack from '$lib/server/slack.js';
import { trackPost } from '$lib/server/unified.js';
import { extractLinks } from '$lib/server/links.js';
import { lookupVideo } from '$lib/server/facts.js';
import {
	countSubmission,
	countWithOtherPlatform,
	findPendingPrimary,
	findSameVideo,
	PENDING_REACTION
} from '$lib/server/pending.js';
import { messages } from '$lib/server/messages.js';
import { isYswsEligible } from '$lib/server/verification.js';
import { syncParticipantTotalViews, postFields, previewFields, ensureTz } from '$lib/server/jobs.js';
import { serialize } from '$lib/server/queue.js';
import { markMessageDeleted } from '$lib/server/deletion.js';
import { streakDay, isPostTooOld, isVideoTooShort } from '$lib/server/streak.js';

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
 *   deleted_ts?: string,
 *   previous_message?: { user?: string, bot_id?: string }
 * }} SlackEvent
 */

// Matched on platform + video id rather than url so a repost of the same video under a different
// link shape still lands on the row already stored. Deleted rows don't block a repost.
/**
 * @param {string} platform
 * @param {string} videoId
 */
async function findSubmissionByVideo(platform, videoId) {
	return airtable.find(
		TABLES.submissions,
		`AND(${airtable.eq(F.submissions.platform, platform)}, ${airtable.eq(F.submissions.videoId, videoId)}, ${SUBMISSION_NOT_DELETED})`
	);
}

/** @typedef {{ url: string, platform: string, videoId: string }} Link */
/** @typedef {import('$lib/server/airtable.js').AirtableRecord} AirtableRecord */

// Instagram goes last since its length isn't known instantly; the first link is the submission.
/** @param {SlackEvent} event */
async function handleSubmissionMessage(event) {
	const links = await extractLinks(event.text);
	const [link, ...others] = links.sort(
		(a, b) => Number(a.platform === 'instagram') - Number(b.platform === 'instagram')
	);
	if (!link) {
		await slack.addReaction(event.channel, event.ts, 'question');
		await slack.postMessage(event.channel, messages.unsupportedLink(event.user), event.ts);
		return;
	}
	const primary = await handleSubmission(event, link);
	if (!primary) return;
	for (const other of others) await addOtherPlatform(event, primary, other);
}

/**
 * @param {SlackEvent} event
 * @param {Link} link
 * @returns {Promise<AirtableRecord | null>} the stored submission, or null if it was refused
 */
async function handleSubmission(event, link) {
	const admin = isAdmin(event.user);
	if (!config.submissionsOpen && !admin) {
		await slack.addReaction(event.channel, event.ts, 'hourglass');
		await slack.postMessage(event.channel, messages.notLaunched(event.user), event.ts);
		return null;
	}

	// Participants are only created at HCA sign-in, never here.
	const found = await airtable.find(
		TABLES.participants,
		airtable.eq(F.participants.slackId, event.user)
	);
	if (!found) {
		await slack.addReaction(event.channel, event.ts, 'lock');
		await slack.postMessage(event.channel, messages.notSignedIn(event.user), event.ts);
		return null;
	}
	const participant = await ensureTz(found);
	/** @param {string} text */
	const reply = (text) =>
		slack.postMessage(event.channel, text, event.ts, messages.submissionBlocks(text, participant.fields));
	if (!admin && !isYswsEligible(participant.fields[F.participants.yswsEligible])) {
		await slack.addReaction(event.channel, event.ts, 'lock');
		await slack.postMessage(
			event.channel,
			messages.notVerified(event.user, participant.fields[F.participants.verificationStatus]),
			event.ts
		);
		return null;
	}

	// Ahead of the stats lookup and of trackPost: a video already stored is refused outright, so
	// nothing is written and no paid work is started for it.
	if (await findSubmissionByVideo(link.platform, link.videoId)) {
		await slack.addReaction(event.channel, event.ts, 'x');
		await reply(messages.duplicateVideo(event.user));
		return null;
	}

	const { stats, facts } = await lookupVideo(link);

	if (!admin && isPostTooOld(facts.publishedAt, config.maxPostAgeDays)) {
		await slack.addReaction(event.channel, event.ts, 'hourglass');
		await reply(messages.postTooOld(event.user, config.maxPostAgeDays));
		return null;
	}

	if (!admin && isVideoTooShort(facts.durationSeconds, config.minVideoSeconds)) {
		await slack.addReaction(event.channel, event.ts, 'hourglass');
		await reply(messages.videoTooShort(event.user, config.minVideoSeconds));
		return null;
	}

	const same = await findSameVideo(
		event.user,
		link.platform,
		facts.durationSeconds,
		new Date().toISOString()
	);
	if (same) {
		if (await addOtherPlatform(event, same, link)) {
			await slack.addReaction(event.channel, event.ts, 'white_check_mark');
			const original = slack.permalink(same.fields[F.submissions.channelId], same.fields[F.submissions.messageTs]);
			await reply(messages.mergedIntoEarlier(event.user, original));
		}
		return same;
	}

	// Paid, so it sits behind every gate above and only fires when the read found no row.
	const trackedId = stats ? null : await trackPost(link.url);

	/** @type {Record<string, unknown>} */
	const statsFields = stats
		? postFields(stats)
		: trackedId
			? { [F.submissions.unifiedId]: trackedId }
			: {};
	Object.assign(statsFields, await previewFields(link, statsFields));

	const submissionFields = {
		[F.submissions.slackId]: event.user,
		[F.submissions.url]: link.url,
		[F.submissions.platform]: link.platform,
		[F.submissions.videoId]: link.videoId,
		[F.submissions.postedAt]: new Date().toISOString(),
		[F.submissions.day]: streakDay(participant.fields[F.participants.tz]),
		[F.submissions.channelId]: event.channel,
		[F.submissions.messageTs]: event.ts,
		...statsFields
	};

	if (
		!admin &&
		(!facts.publishedAt || facts.durationSeconds == null || (await findPendingPrimary(event.user)))
	) {
		await slack.addReaction(event.channel, event.ts, PENDING_REACTION);
		const waiting = await reply(messages.awaitingData(event.user, link.platform));
		return airtable.create(TABLES.submissions, {
			...submissionFields,
			[F.submissions.pendingCheck]: true,
			[F.submissions.replyMessageTs]: waiting.ts
		});
	}

	return countSubmission(participant, submissionFields, stats);
}

/** @param {AirtableRecord} primary */
function listOtherPlatforms(primary) {
	return airtable.list(TABLES.submissions, {
		filterByFormula: `AND(${airtable.eq(F.submissions.primarySubmission, primary.id)}, ${SUBMISSION_NOT_DELETED})`
	});
}

// Another platform's link to an already-stored video. It never touches the streak, but adds its
// views to the video's and the poster's totals, so it gets the same duplicate, age and length
// gates. Age is judged against when the video was first submitted.
/**
 * @param {SlackEvent} event
 * @param {AirtableRecord} primary
 * @param {Link} link
 * @returns {Promise<boolean>} whether it was added
 */
async function addOtherPlatform(event, primary, link) {
	const linked = [primary, ...(await listOtherPlatforms(primary))];
	if (linked.some((s) => s.fields[F.submissions.platform] === link.platform)) {
		await slack.postMessage(
			event.channel,
			messages.platformAlreadyLinked(event.user, link.platform),
			event.ts
		);
		return false;
	}

	// Ahead of trackPost, for the same reason as in handleSubmission.
	if (await findSubmissionByVideo(link.platform, link.videoId)) {
		await slack.postMessage(event.channel, messages.otherPlatformDuplicate(event.user), event.ts);
		return false;
	}

	const { stats, facts } = await lookupVideo(link);

	const admin = isAdmin(event.user);
	const submittedAt = new Date(primary.fields[F.submissions.postedAt] ?? Date.now());
	if (!admin && isPostTooOld(facts.publishedAt, config.maxPostAgeDays, submittedAt)) {
		await slack.postMessage(event.channel, messages.otherPlatformTooOld(event.user), event.ts);
		return false;
	}
	if (!admin && isVideoTooShort(facts.durationSeconds, config.minVideoSeconds)) {
		await slack.postMessage(
			event.channel,
			messages.otherPlatformTooShort(event.user, config.minVideoSeconds),
			event.ts
		);
		return false;
	}
	const pending = !admin && (!facts.publishedAt || facts.durationSeconds == null);

	const trackedId = stats ? null : await trackPost(link.url);
	/** @type {Record<string, unknown>} */
	const statsFields = stats
		? postFields(stats)
		: trackedId
			? { [F.submissions.unifiedId]: trackedId }
			: {};
	Object.assign(statsFields, await previewFields(link, statsFields));

	await airtable.create(TABLES.submissions, {
		[F.submissions.slackId]: event.user,
		[F.submissions.url]: link.url,
		[F.submissions.platform]: link.platform,
		[F.submissions.videoId]: link.videoId,
		[F.submissions.postedAt]: new Date().toISOString(),
		[F.submissions.day]: primary.fields[F.submissions.day],
		[F.submissions.countedTowardStreak]: false,
		[F.submissions.channelId]: event.channel,
		[F.submissions.messageTs]: event.ts,
		[F.submissions.primarySubmission]: primary.id,
		...statsFields,
		...(pending ? { [F.submissions.pendingCheck]: true } : {})
	});

	if (pending) {
		await slack.postMessage(event.channel, messages.otherPlatformAwaitingData(event.user), event.ts);
		return false;
	}
	if (stats) {
		const participant = await airtable.find(
			TABLES.participants,
			airtable.eq(F.participants.slackId, event.user)
		);
		if (participant) await syncParticipantTotalViews(participant);
	}
	if (facts.durationSeconds != null) await countWithOtherPlatform(primary, facts.durationSeconds);
	return true;
}

// Only the poster's own replies under a stored submission are read; every other reply is ignored.
/** @param {SlackEvent} event */
async function handleThreadReply(event) {
	const links = await extractLinks(event.text);
	if (!links.length || !event.thread_ts) return;

	const primary = await airtable.find(
		TABLES.submissions,
		`AND(${airtable.eq(F.submissions.messageTs, event.thread_ts)}, ${airtable.eq(F.submissions.slackId, event.user)}, ${SUBMISSION_IS_PRIMARY}, ${SUBMISSION_NOT_DELETED})`
	);
	if (!primary) return;

	let added = false;
	for (const link of links) {
		if (await addOtherPlatform(event, primary, link)) added = true;
	}
	if (added) await slack.addReaction(event.channel, event.ts, 'white_check_mark');
}

// Greets the channel when the bot itself is invited; every other member joining is ignored.
/** @param {SlackEvent} event */
async function handleMemberJoined(event) {
	if (event.user !== (await slack.botUserId())) return;
	await slack.postMessage(event.channel, 'dayoneof bot is here!');
}

// A deleted submission message is flagged for the admin page and its bot reply deleted.
/** @param {SlackEvent} event */
async function handleMessageDeleted(event) {
	const previous = event.previous_message;
	if (!previous?.user || previous.bot_id || !event.deleted_ts) return;

	// A message linking several platforms stored a submission for each.
	const submissions = await airtable.list(TABLES.submissions, {
		filterByFormula: airtable.eq(F.submissions.messageTs, event.deleted_ts)
	});
	for (const submission of submissions) await markMessageDeleted(submission);
}

/** @param {SlackEvent} [event] */
async function handleEvent(event) {
	if (!event) return;

	if (event.type === 'member_joined_channel') return handleMemberJoined(event);

	if (event.type === 'message') {
		if (event.channel !== config.submissionChannelId) return;
		if (event.subtype === 'message_deleted') return handleMessageDeleted(event);
		// Edits, joins and the bot's own replies all arrive here as message events.
		if (event.subtype || event.bot_id) return;
		if (event.thread_ts && event.thread_ts !== event.ts) {
			return serialize(() => handleThreadReply(event));
		}
		return serialize(() => handleSubmissionMessage(event));
	}
}

// Last resort when a handler threw: without this the poster sees no reaction and no reply and
// has no way to tell a broken submission from an ignored one. Only the submissions channel gets
// this, since that is the only place the message's "that post" means anything. Swallows its own
// failure, since Slack is usually what's already broken by the time we get here.
/** @param {SlackEvent} [event] */
async function replyWithFailure(event) {
	if (!event?.user || event.type !== 'message') return;
	if (event.channel !== config.submissionChannelId) return;
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

	if (!slack.verifySignature(rawBody, timestamp, signature)) {
		return json({ error: 'invalid signature' }, { status: 401 });
	}

	const body = JSON.parse(rawBody);

	if (body.type === 'url_verification') {
		return json({ challenge: body.challenge });
	}

	if (request.headers.get('x-slack-retry-num')) {
		return json({ ok: true });
	}

	// Acked before handling: a submission waits its turn in the queue and on Airtable's rate limit,
	// and Slack gives up on an event it hasn't had a 200 for within 3 seconds.
	handleEvent(body.event).catch(async (err) => {
		console.error('slack event handling failed', body.event?.channel, body.event?.ts, err);
		await replyWithFailure(body.event);
	});

	return json({ ok: true });
}
