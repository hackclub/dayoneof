// Deleting a video only marks it: the row, its day and the streak it earned are all kept, along
// with a snapshot of the participant before the delete, so an admin can restore it in one click.
import { TABLES, F, SUBMISSION_NOT_DELETED } from './config.js';
import * as airtable from './airtable.js';
import * as slack from './slack.js';
import { syncParticipantTotalViews, findParticipant } from './jobs.js';
import { streakDay, afterDeletingPost } from './streak.js';

/** @typedef {import('./airtable.js').AirtableRecord} AirtableRecord */

const RESTORED_FIELDS = [
	F.participants.currentStreak,
	F.participants.streakFreezes,
	F.participants.daysCompleted,
	F.participants.status,
	F.participants.lastDay
];

/**
 * @param {AirtableRecord} participant
 * @param {AirtableRecord} submission
 */
export function deletionPlan(participant, submission) {
	const p = participant.fields;
	return afterDeletingPost(
		{
			streak: p[F.participants.currentStreak] ?? 0,
			freezes: p[F.participants.streakFreezes] ?? 0,
			daysCompleted: p[F.participants.daysCompleted] ?? 0
		},
		submission.fields[F.submissions.day],
		streakDay(p[F.participants.tz])
	);
}

/**
 * @param {string} label
 * @param {() => Promise<unknown>} fn
 */
async function bestEffort(label, fn) {
	try {
		await fn();
	} catch (err) {
		console.error(label, err);
	}
}

/**
 * @param {string} slackId
 * @param {string} date
 */
function findLivePostedDay(slackId, date) {
	return airtable.find(
		TABLES.days,
		`AND(${airtable.eq(F.days.slackId, slackId)}, ${airtable.eq(F.days.date, date)}, ${airtable.eq(F.days.status, 'posted')}, {${F.days.deletedAt}} = BLANK())`
	);
}

/**
 * @param {string} primaryId
 * @param {string} filter
 */
function listOtherPlatforms(primaryId, filter) {
	return airtable.list(TABLES.submissions, {
		filterByFormula: `AND(${airtable.eq(F.submissions.primarySubmission, primaryId)}, ${filter})`
	});
}

/** @param {Record<string, any>} fields */
function postReaction(fields) {
	return fields[F.submissions.countedTowardStreak] ? 'white_check_mark' : 'repeat';
}

// The bot's reply would otherwise sit alone in the thread and keep its tombstone visible.
/** @param {AirtableRecord} submission */
export async function markMessageDeleted(submission) {
	const fields = submission.fields;
	await airtable.update(TABLES.submissions, submission.id, {
		[F.submissions.messageDeletedAt]: new Date().toISOString()
	});
	const channel = fields[F.submissions.channelId];
	const replyTs = fields[F.submissions.replyMessageTs];
	if (channel && replyTs && !fields[F.submissions.deletedAt]) {
		await bestEffort('delete bot reply failed', () => slack.deleteMessage(channel, replyTs));
	}
}

// Catches submission messages deleted while delete events weren't being received.
export async function sweepDeletedMessages() {
	const submissions = await airtable.list(TABLES.submissions, {
		filterByFormula: `AND({${F.submissions.messageDeletedAt}} = BLANK(), {${F.submissions.channelId}}, {${F.submissions.messageTs}})`
	});
	let found = 0;
	for (const submission of submissions) {
		const { [F.submissions.channelId]: channel, [F.submissions.messageTs]: messageTs } = submission.fields;
		if (await slack.messageExists(channel, messageTs)) continue;
		await markMessageDeleted(submission);
		found++;
	}
	return { checked: submissions.length, found };
}

// Callers run this inside serialize(), like every other streak write.
/**
 * @param {string} submissionId
 * @param {string} slackId
 */
export async function deleteSubmission(submissionId, slackId) {
	const submission = await airtable.get(TABLES.submissions, submissionId);
	const fields = submission.fields;
	if (fields[F.submissions.slackId] !== slackId || fields[F.submissions.deletedAt]) return null;

	const participant = await findParticipant(slackId);
	const now = new Date().toISOString();
	let impact = 'none';
	let state = null;
	/** @type {Record<string, any> | null} */
	let participantFields = null;

	if (participant && fields[F.submissions.countedTowardStreak]) {
		const p = participant.fields;
		const next = deletionPlan(participant, submission);
		impact = next.impact;
		participantFields = next.fields;

		const day = await findLivePostedDay(slackId, fields[F.submissions.day]);
		if (day) await airtable.update(TABLES.days, day.id, { [F.days.deletedAt]: now });
		const replacement = next.dayStatus
			? await airtable.create(TABLES.days, {
					[F.days.slackId]: slackId,
					[F.days.date]: fields[F.submissions.day],
					[F.days.status]: next.dayStatus
				})
			: null;

		state = {
			participant: Object.fromEntries(RESTORED_FIELDS.map((f) => [f, p[f] ?? null])),
			dayId: day?.id ?? null,
			replacementDayId: replacement?.id ?? null
		};
	}

	await airtable.update(TABLES.submissions, submission.id, {
		[F.submissions.deletedAt]: now,
		[F.submissions.preDeleteState]: state ? JSON.stringify(state) : ''
	});
	for (const other of await listOtherPlatforms(submission.id, SUBMISSION_NOT_DELETED)) {
		await airtable.update(TABLES.submissions, other.id, { [F.submissions.deletedAt]: now });
	}
	if (participant && participantFields) {
		await airtable.update(TABLES.participants, participant.id, participantFields);
	}
	if (participant) await syncParticipantTotalViews(participant);

	const channel = fields[F.submissions.channelId];
	const messageTs = fields[F.submissions.messageTs];
	const replyTs = fields[F.submissions.replyMessageTs];
	if (channel && replyTs) {
		await bestEffort('delete bot reply failed', () => slack.deleteMessage(channel, replyTs));
	}
	if (channel && messageTs) {
		await bestEffort('remove reaction failed', () =>
			slack.removeReaction(channel, messageTs, postReaction(fields))
		);
		await bestEffort('add wastebasket failed', () =>
			slack.addReaction(channel, messageTs, 'wastebasket')
		);
	}

	return impact;
}

// Puts the participant back exactly as they were before the delete, overwriting anything since.
// The bot's deleted reply is not re-posted.
/** @param {string} submissionId */
export async function restoreSubmission(submissionId) {
	const submission = await airtable.get(TABLES.submissions, submissionId);
	const fields = submission.fields;
	if (!fields[F.submissions.deletedAt]) return;

	const state = fields[F.submissions.preDeleteState]
		? JSON.parse(fields[F.submissions.preDeleteState])
		: null;
	const participant = await findParticipant(fields[F.submissions.slackId]);

	if (state?.replacementDayId) {
		await airtable.update(TABLES.days, state.replacementDayId, {
			[F.days.deletedAt]: new Date().toISOString()
		});
	}
	if (state?.dayId) await airtable.update(TABLES.days, state.dayId, { [F.days.deletedAt]: null });
	if (state && participant) {
		await airtable.update(TABLES.participants, participant.id, state.participant);
	}

	await airtable.update(TABLES.submissions, submission.id, {
		[F.submissions.deletedAt]: null,
		[F.submissions.preDeleteState]: ''
	});
	// Only the platforms deleted along with it, matched by the shared timestamp.
	for (const other of await listOtherPlatforms(submission.id, `{${F.submissions.deletedAt}}`)) {
		if (other.fields[F.submissions.deletedAt] !== fields[F.submissions.deletedAt]) continue;
		await airtable.update(TABLES.submissions, other.id, { [F.submissions.deletedAt]: null });
	}
	if (participant) await syncParticipantTotalViews(participant);

	const channel = fields[F.submissions.channelId];
	const messageTs = fields[F.submissions.messageTs];
	if (channel && messageTs) {
		await bestEffort('remove wastebasket failed', () =>
			slack.removeReaction(channel, messageTs, 'wastebasket')
		);
		await bestEffort('re-add reaction failed', () =>
			slack.addReaction(channel, messageTs, postReaction(fields))
		);
	}
}
