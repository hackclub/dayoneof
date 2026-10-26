import { json } from '@sveltejs/kit';
import {
	config,
	requireEnv,
	isAdmin,
	TABLES,
	F,
	SUBMISSION_NOT_DELETED,
	SUBMISSION_IS_PRIMARY
} from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import * as slack from '$lib/server/slack.js';
import { fetchPostByPlatformId, trackPost } from '$lib/server/unified.js';
import { extractLinks } from '$lib/server/links.js';
import { messages, statsLine } from '$lib/server/messages.js';
import { isYswsEligible } from '$lib/server/verification.js';
import {
	syncParticipantTotalViews,
	settleParticipant,
	postFields,
	previewFields
} from '$lib/server/jobs.js';
import { serialize } from '$lib/server/queue.js';
import { markMessageDeleted } from '$lib/server/deletion.js';
import {
	streakDay,
	addDays,
	isPostTooOld,
	isVideoTooShort,
	freezesAfterPost,
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

// The first link is the submission; any others in the same message are its other platforms.
/** @param {SlackEvent} event */
async function handleSubmissionMessage(event) {
	const [link, ...others] = await extractLinks(event.text);
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
	if (!config.submissionsOpen && !isAdmin(event.user)) {
		await slack.addReaction(event.channel, event.ts, 'hourglass');
		await slack.postMessage(event.channel, messages.notLaunched(event.user), event.ts);
		return null;
	}

	// Participants are only created at HCA sign-in, never here.
	const participant = await airtable.find(
		TABLES.participants,
		airtable.eq(F.participants.slackId, event.user)
	);
	if (!participant) {
		await slack.addReaction(event.channel, event.ts, 'lock');
		await slack.postMessage(event.channel, messages.notSignedIn(event.user), event.ts);
		return null;
	}
	if (!isYswsEligible(participant.fields[F.participants.yswsEligible])) {
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
		await slack.postMessage(event.channel, messages.duplicateVideo(event.user), event.ts);
		return null;
	}

	// Looked up once, before anything is written, because the age rule below has to be able to
	// refuse the post without having left a day or a submission row behind.
	let stats = null;
	try {
		stats = await fetchPostByPlatformId(link.platform, link.videoId);
	} catch (err) {
		console.error('unified-socials stats lookup failed at submission time', err);
	}

	if (isPostTooOld(stats?.publishedAt, config.maxPostAgeDays)) {
		await slack.addReaction(event.channel, event.ts, 'hourglass');
		await slack.postMessage(
			event.channel,
			messages.postTooOld(event.user, config.maxPostAgeDays),
			event.ts
		);
		return null;
	}

	if (isVideoTooShort(stats?.durationSeconds, config.minVideoSeconds)) {
		await slack.addReaction(event.channel, event.ts, 'hourglass');
		await slack.postMessage(
			event.channel,
			messages.videoTooShort(event.user, config.minVideoSeconds),
			event.ts
		);
		return null;
	}

	// Paid, so it sits behind every gate above: an unverified poster or a video that just got
	// refused for being too old or too short never reaches it, and it only fires when the read found no row.
	const trackedId = stats ? null : await trackPost(link.url);

	/** @type {Record<string, unknown>} */
	const statsFields = stats
		? postFields(stats)
		: trackedId
			? { [F.submissions.unifiedId]: trackedId }
			: {};
	Object.assign(statsFields, await previewFields(link, statsFields));

	const today = streakDay(participant.fields[F.participants.tz]);
	// Settles any unposted days first, so the streak and freezes below already account for them.
	const { record } = await settleParticipant(participant, addDays(today, -1));
	const streakBefore = record.fields[F.participants.currentStreak] ?? 0;
	const freezesBefore = record.fields[F.participants.streakFreezes] ?? 0;

	const submissionFields = {
		[F.submissions.slackId]: event.user,
		[F.submissions.url]: link.url,
		[F.submissions.platform]: link.platform,
		[F.submissions.videoId]: link.videoId,
		[F.submissions.postedAt]: new Date().toISOString(),
		[F.submissions.day]: today,
		[F.submissions.channelId]: event.channel,
		[F.submissions.messageTs]: event.ts,
		...statsFields
	};

	if (record.fields[F.participants.lastDay] >= today) {
		await slack.addReaction(event.channel, event.ts, 'repeat');
		const duplicate = await airtable.create(TABLES.submissions, {
			...submissionFields,
			[F.submissions.countedTowardStreak]: false
		});
		if (stats) await syncParticipantTotalViews(record);
		const reply = await slack.postMessage(
			event.channel,
			messages.duplicatePost(event.user, streakBefore, freezesBefore, stats),
			event.ts
		);
		// Kept so deleting this video can delete the reply too.
		await airtable.update(TABLES.submissions, duplicate.id, {
			[F.submissions.replyMessageTs]: reply.ts
		});
		return duplicate;
	}

	await airtable.create(TABLES.days, {
		[F.days.slackId]: event.user,
		[F.days.date]: today,
		[F.days.status]: 'posted'
	});

	const streak = streakBefore + 1;
	const completed = (record.fields[F.participants.daysCompleted] ?? 0) + 1;
	const freezes = freezesAfterPost(freezesBefore, completed);

	const submission = await airtable.create(TABLES.submissions, {
		...submissionFields,
		[F.submissions.countedTowardStreak]: true,
		[F.submissions.streakAtPost]: streak,
		[F.submissions.freezesAtPost]: freezes
	});

	const updated = await airtable.update(TABLES.participants, participant.id, {
		[F.participants.daysCompleted]: completed,
		[F.participants.streakFreezes]: freezes,
		[F.participants.currentStreak]: streak,
		[F.participants.status]: 'active',
		[F.participants.lastDay]: today
	});
	if (stats) await syncParticipantTotalViews(updated);

	try {
		await slack.addReaction(event.channel, event.ts, 'white_check_mark');
		const reply = await slack.postMessage(event.channel, messages.streakUpdate(streak, freezes, stats), event.ts);
		// Lets the leaderboard job edit this reply with fresh stats instead of posting a new one.
		await airtable.update(TABLES.submissions, submission.id, {
			[F.submissions.replyMessageTs]: reply.ts,
			[F.submissions.replyStats]: statsLine(stats)
		});
	} catch (err) {
		console.error('react/reply to submission failed', event.channel, event.ts, err);
	}

	const milestone = nextMilestone(streak, participant.fields[F.participants.lastMilestone]);
	if (milestone) {
		const announceChannelId = requireEnv('SLACK_ANNOUNCE_CHANNEL_ID', config.announceChannelId);
		await slack.postMessage(announceChannelId, messages.milestoneAnnounce(event.user, milestone));
		await slack
			.postMessage(event.channel, messages.milestoneThread(event.user, milestone), event.ts)
			.catch((err) => console.error('milestone thread reply failed', err));
		await slack.dm(event.user, messages.milestoneDm(milestone));
		await airtable.update(TABLES.participants, participant.id, {
			[F.participants.lastMilestone]: milestone,
			[F.participants.lastMilestoneAt]: new Date().toISOString()
		});
	}

	return submission;
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

	let stats = null;
	try {
		stats = await fetchPostByPlatformId(link.platform, link.videoId);
	} catch (err) {
		console.error('unified-socials stats lookup failed for another platform', err);
	}

	const submittedAt = new Date(primary.fields[F.submissions.postedAt] ?? Date.now());
	if (isPostTooOld(stats?.publishedAt, config.maxPostAgeDays, submittedAt)) {
		await slack.postMessage(event.channel, messages.otherPlatformTooOld(event.user), event.ts);
		return false;
	}
	if (isVideoTooShort(stats?.durationSeconds, config.minVideoSeconds)) {
		await slack.postMessage(
			event.channel,
			messages.otherPlatformTooShort(event.user, config.minVideoSeconds),
			event.ts
		);
		return false;
	}

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
		...statsFields
	});

	if (stats) {
		const participant = await airtable.find(
			TABLES.participants,
			airtable.eq(F.participants.slackId, event.user)
		);
		if (participant) await syncParticipantTotalViews(participant);
	}
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
