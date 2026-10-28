// Counts submissions, at post time or from the cron once a pending one's age and length are known.
import { config, requireEnv, TABLES, F, SUBMISSION_NOT_DELETED, isAdmin } from './config.js';
import * as airtable from './airtable.js';
import * as slack from './slack.js';
import { messages, statsLine } from './messages.js';
import { serialize } from './queue.js';
import { lookupVideo } from './facts.js';
import { settleParticipant, syncParticipantTotalViews, findParticipant, postFields } from './jobs.js';
import { addDays, isPostTooOld, isVideoTooShort, freezesAfterPost, nextMilestone } from './streak.js';
import { MAX_DURATION_GAP } from './repeats.js';

/** @typedef {import('./airtable.js').AirtableRecord} AirtableRecord */
/** @typedef {import('./messages.js').PostStats} PostStats */

export const PENDING_REACTION = 'hourglass_flowing_sand';
const PENDING_TIMEOUT_MS = 6 * 60 * 60 * 1000;

const SAME_VIDEO_WINDOW_MS = 48 * 60 * 60 * 1000;

// A poster's recent video of the same length that isn't on this platform yet is the same upload.
/**
 * @param {string} slackId
 * @param {string} platform
 * @param {number | null} durationSeconds
 * @param {string} before ISO time; only videos submitted earlier count
 */
export async function findSameVideo(slackId, platform, durationSeconds, before) {
	if (durationSeconds == null) return null;
	const since = new Date(Date.parse(before) - SAME_VIDEO_WINDOW_MS).toISOString();
	const recent = await airtable.list(TABLES.submissions, {
		filterByFormula: `AND(${airtable.eq(F.submissions.slackId, slackId)}, ${SUBMISSION_NOT_DELETED}, IS_AFTER({${F.submissions.postedAt}}, '${since}'), IS_BEFORE({${F.submissions.postedAt}}, '${before}'))`
	});
	const videoOf = (/** @type {AirtableRecord} */ s) => s.fields[F.submissions.primarySubmission] || s.id;
	const onPlatform = new Set(
		recent.filter((s) => s.fields[F.submissions.platform] === platform).map(videoOf)
	);
	return (
		recent
			.filter((s) => !s.fields[F.submissions.primarySubmission] && !onPlatform.has(s.id))
			.filter((s) => {
				const d = s.fields[F.submissions.durationSeconds];
				return typeof d === 'number' && Math.abs(d - durationSeconds) <= MAX_DURATION_GAP;
			})
			.sort((a, b) => (a.fields[F.submissions.postedAt] < b.fields[F.submissions.postedAt] ? 1 : -1))[0] ??
		null
	);
}

/** @param {string} slackId */
export function findPendingPrimary(slackId) {
	return airtable.find(
		TABLES.submissions,
		`AND(${airtable.eq(F.submissions.slackId, slackId)}, {${F.submissions.pendingCheck}}, {${F.submissions.primarySubmission}} = BLANK(), ${SUBMISSION_NOT_DELETED})`
	);
}

// Pending rows are finished in place and their waiting reply edited. Run inside serialize().
/**
 * @param {AirtableRecord} participant
 * @param {Record<string, unknown>} fields everything for a new row, or just the changes for a pending one
 * @param {PostStats | null} stats
 * @param {AirtableRecord} [pending]
 * @returns {Promise<AirtableRecord>}
 */
export async function countSubmission(participant, fields, stats, pending) {
	const all = { ...pending?.fields, ...fields };
	const slackId = String(all[F.submissions.slackId]);
	const channel = String(all[F.submissions.channelId]);
	const messageTs = String(all[F.submissions.messageTs]);
	const day = String(all[F.submissions.day]);

	/** @param {Record<string, unknown>} extra */
	const save = (extra) =>
		pending
			? airtable.update(TABLES.submissions, pending.id, {
					...fields,
					...extra,
					[F.submissions.pendingCheck]: false
				})
			: airtable.create(TABLES.submissions, { ...fields, ...extra });
	/** @param {string} text */
	const reply = async (text) => {
		const replyTs = pending?.fields[F.submissions.replyMessageTs];
		if (!replyTs) return (await slack.postMessage(channel, text, messageTs)).ts;
		await slack.updateMessage(channel, replyTs, text);
		return replyTs;
	};
	if (pending) {
		await slack.removeReaction(channel, messageTs, PENDING_REACTION).catch((err) => {
			console.error('remove pending reaction failed', err);
		});
	}

	// Settles any unposted days first, so the streak and freezes below already account for them.
	const { record } = await settleParticipant(participant, addDays(day, -1));
	const streakBefore = record.fields[F.participants.currentStreak] ?? 0;
	const freezesBefore = record.fields[F.participants.streakFreezes] ?? 0;

	if (record.fields[F.participants.lastDay] >= day) {
		await slack.addReaction(channel, messageTs, 'repeat');
		const duplicate = await save({ [F.submissions.countedTowardStreak]: false });
		if (stats) await syncParticipantTotalViews(record);
		const replyTs = await reply(messages.duplicatePost(slackId, streakBefore, freezesBefore, stats));
		// Kept so deleting this video can delete the reply too.
		await airtable.update(TABLES.submissions, duplicate.id, {
			[F.submissions.replyMessageTs]: replyTs
		});
		return duplicate;
	}

	await airtable.create(TABLES.days, {
		[F.days.slackId]: slackId,
		[F.days.date]: day,
		[F.days.status]: 'posted'
	});

	const streak = streakBefore + 1;
	const completed = (record.fields[F.participants.daysCompleted] ?? 0) + 1;
	const freezes = freezesAfterPost(freezesBefore, completed);

	const submission = await save({
		[F.submissions.countedTowardStreak]: true,
		[F.submissions.streakAtPost]: streak,
		[F.submissions.freezesAtPost]: freezes
	});

	const updated = await airtable.update(TABLES.participants, participant.id, {
		[F.participants.daysCompleted]: completed,
		[F.participants.streakFreezes]: freezes,
		[F.participants.currentStreak]: streak,
		[F.participants.status]: 'active',
		[F.participants.lastDay]: day
	});
	if (stats) await syncParticipantTotalViews(updated);

	try {
		await slack.addReaction(channel, messageTs, 'white_check_mark');
		const replyTs = await reply(messages.streakUpdate(streak, freezes, stats));
		// Lets the leaderboard job edit this reply with fresh stats instead of posting a new one.
		await airtable.update(TABLES.submissions, submission.id, {
			[F.submissions.replyMessageTs]: replyTs,
			[F.submissions.replyStats]: statsLine(stats)
		});
	} catch (err) {
		console.error('react/reply to submission failed', channel, messageTs, err);
	}

	const milestone = nextMilestone(streak, participant.fields[F.participants.lastMilestone]);
	if (milestone) {
		const announceChannelId = requireEnv('SLACK_ANNOUNCE_CHANNEL_ID', config.announceChannelId);
		await slack.postMessage(announceChannelId, messages.milestoneAnnounce(slackId, milestone));
		await slack
			.postMessage(channel, messages.milestoneThread(slackId, milestone), messageTs)
			.catch((err) => console.error('milestone thread reply failed', err));
		await slack.dm(slackId, messages.milestoneDm(milestone));
		await airtable.update(TABLES.participants, participant.id, {
			[F.participants.lastMilestone]: milestone,
			[F.participants.lastMilestoneAt]: new Date().toISOString()
		});
	}

	return submission;
}

/**
 * @param {AirtableRecord} row
 * @param {'old' | 'short'} reason
 */
async function rejectPending(row, reason) {
	const f = row.fields;
	const slackId = f[F.submissions.slackId];
	const channel = f[F.submissions.channelId];
	const messageTs = f[F.submissions.messageTs];
	const isPrimary = !f[F.submissions.primarySubmission];
	const now = new Date().toISOString();

	await airtable.update(TABLES.submissions, row.id, {
		[F.submissions.deletedAt]: now,
		[F.submissions.pendingCheck]: false
	});

	const text = isPrimary
		? reason === 'old'
			? messages.postTooOld(slackId, config.maxPostAgeDays)
			: messages.videoTooShort(slackId, config.minVideoSeconds)
		: reason === 'old'
			? messages.otherPlatformTooOld(slackId)
			: messages.otherPlatformTooShort(slackId, config.minVideoSeconds);

	if (!isPrimary) {
		await slack.postMessage(channel, text, messageTs);
		return;
	}
	const others = await airtable.list(TABLES.submissions, {
		filterByFormula: `AND(${airtable.eq(F.submissions.primarySubmission, row.id)}, ${SUBMISSION_NOT_DELETED})`
	});
	for (const other of others) {
		await airtable.update(TABLES.submissions, other.id, {
			[F.submissions.deletedAt]: now,
			[F.submissions.pendingCheck]: false
		});
	}
	await slack.removeReaction(channel, messageTs, PENDING_REACTION).catch(() => {});
	await slack.addReaction(channel, messageTs, 'x');
	const replyTs = f[F.submissions.replyMessageTs];
	if (replyTs) await slack.updateMessage(channel, replyTs, text);
	else await slack.postMessage(channel, text, messageTs);
}

/**
 * @param {AirtableRecord} row
 * @param {Parameters<typeof postFields>[0] | null} stats
 */
async function finishPending(row, stats) {
	const f = row.fields;
	const changes = stats ? postFields(stats) : {};
	const participant = await findParticipant(f[F.submissions.slackId]);

	if (f[F.submissions.primarySubmission]) {
		await airtable.update(TABLES.submissions, row.id, {
			...changes,
			[F.submissions.pendingCheck]: false
		});
		if (stats && participant) await syncParticipantTotalViews(participant);
		await slack.addReaction(f[F.submissions.channelId], f[F.submissions.messageTs], 'white_check_mark');
		return;
	}
	if (participant) await countSubmission(participant, changes, stats, row);
}

/**
 * @param {AirtableRecord} row
 * @param {AirtableRecord} into
 * @param {Parameters<typeof postFields>[0] | null} stats
 */
async function mergePending(row, into, stats) {
	const f = row.fields;
	const channel = f[F.submissions.channelId];
	const messageTs = f[F.submissions.messageTs];
	await airtable.update(TABLES.submissions, row.id, {
		...(stats ? postFields(stats) : {}),
		[F.submissions.primarySubmission]: into.id,
		[F.submissions.day]: into.fields[F.submissions.day],
		[F.submissions.pendingCheck]: false
	});
	const participant = await findParticipant(f[F.submissions.slackId]);
	if (stats && participant) await syncParticipantTotalViews(participant);
	await slack.removeReaction(channel, messageTs, PENDING_REACTION).catch(() => {});
	await slack.addReaction(channel, messageTs, 'white_check_mark');
	const text = messages.mergedIntoEarlier(
		f[F.submissions.slackId],
		slack.permalink(into.fields[F.submissions.channelId], into.fields[F.submissions.messageTs])
	);
	const replyTs = f[F.submissions.replyMessageTs];
	if (replyTs) await slack.updateMessage(channel, replyTs, text);
	else await slack.postMessage(channel, text, messageTs);
}

/** @param {AirtableRecord} row */
async function requestReview(row) {
	const f = row.fields;
	await slack.postMessage(f[F.submissions.channelId], messages.manualReview(), f[F.submissions.messageTs]);
	await airtable.update(TABLES.submissions, row.id, {
		[F.submissions.reviewRequestedAt]: new Date().toISOString()
	});
}

// For an admin who has checked a video the bot couldn't.
/** @param {string} submissionId */
export async function approvePending(submissionId) {
	const row = await airtable.get(TABLES.submissions, submissionId);
	if (!row.fields[F.submissions.pendingCheck] || row.fields[F.submissions.deletedAt]) return;
	const { stats } = await lookupVideo({
		platform: row.fields[F.submissions.platform],
		videoId: row.fields[F.submissions.videoId],
		url: row.fields[F.submissions.url]
	});
	await serialize(() => finishPending(row, stats));
}

// Another platform's link is the same video, so its known length lets a pending post count now.
// Callers are already inside serialize(). Anything still in doubt is left to the cron.
/**
 * @param {AirtableRecord} primary
 * @param {number} durationSeconds
 */
export async function countWithOtherPlatform(primary, durationSeconds) {
	const fresh = await airtable.get(TABLES.submissions, primary.id);
	const f = fresh.fields;
	if (!f[F.submissions.pendingCheck] || f[F.submissions.deletedAt]) return;
	const { stats, facts } = await lookupVideo({
		platform: f[F.submissions.platform],
		videoId: f[F.submissions.videoId],
		url: f[F.submissions.url]
	});
	const postedAt = new Date(f[F.submissions.postedAt]);
	if (!isAdmin(f[F.submissions.slackId])) {
		if (!facts.publishedAt || isPostTooOld(facts.publishedAt, config.maxPostAgeDays, postedAt)) return;
		if (isVideoTooShort(durationSeconds, config.minVideoSeconds)) return;
	}
	const earlier = await airtable.find(
		TABLES.submissions,
		`AND(${airtable.eq(F.submissions.slackId, f[F.submissions.slackId])}, {${F.submissions.pendingCheck}}, {${F.submissions.primarySubmission}} = BLANK(), ${SUBMISSION_NOT_DELETED}, IS_BEFORE({${F.submissions.postedAt}}, '${f[F.submissions.postedAt]}'))`
	);
	if (!earlier) await finishPending(fresh, stats);
}

// Oldest first, so a poster's later posts wait behind one still pending and days count in order.
export async function runPending() {
	const rows = await airtable.list(TABLES.submissions, {
		filterByFormula: `AND({${F.submissions.pendingCheck}}, ${SUBMISSION_NOT_DELETED})`,
		sort: [{ field: F.submissions.postedAt, direction: 'asc' }]
	});
	/** @type {Set<string>} */
	const blocked = new Set();
	let counted = 0;
	let rejected = 0;

	for (const row of rows) {
		const f = row.fields;
		const slackId = f[F.submissions.slackId];
		const primaryId = f[F.submissions.primarySubmission];
		if (!primaryId && blocked.has(slackId)) continue;

		if (f[F.submissions.messageDeletedAt]) {
			await airtable.update(TABLES.submissions, row.id, {
				[F.submissions.deletedAt]: new Date().toISOString(),
				[F.submissions.pendingCheck]: false
			});
			continue;
		}

		const link = {
			platform: f[F.submissions.platform],
			videoId: f[F.submissions.videoId],
			url: f[F.submissions.url]
		};
		const { stats, facts } = await lookupVideo(link);
		const judgedFrom = primaryId
			? (await airtable.get(TABLES.submissions, primaryId)).fields[F.submissions.postedAt]
			: f[F.submissions.postedAt];

		/** @type {'old' | 'short' | null} */
		const reason = isAdmin(slackId)
			? null
			: isPostTooOld(facts.publishedAt, config.maxPostAgeDays, new Date(judgedFrom))
				? 'old'
				: isVideoTooShort(facts.durationSeconds, config.minVideoSeconds)
					? 'short'
					: null;
		if (!reason && !isAdmin(slackId) && (!facts.publishedAt || facts.durationSeconds == null)) {
			if (!primaryId) blocked.add(slackId);
			const overdue = Date.now() - Date.parse(f[F.submissions.postedAt]) > PENDING_TIMEOUT_MS;
			if (overdue && !f[F.submissions.reviewRequestedAt]) await requestReview(row);
			continue;
		}

		const same =
			!reason && !primaryId
				? await findSameVideo(slackId, link.platform, facts.durationSeconds, f[F.submissions.postedAt])
				: null;

		try {
			await serialize(() =>
				reason ? rejectPending(row, reason) : same ? mergePending(row, same, stats) : finishPending(row, stats)
			);
			if (reason) rejected++;
			else counted++;
		} catch (err) {
			console.error('finishing pending submission failed', row.id, err);
			if (!primaryId) blocked.add(slackId);
		}
	}

	return { pending: rows.length, counted, rejected };
}
