// Deleting a video only marks it: the row, its day and the streak it earned are all kept, along
// with a snapshot of the participant before the delete, so an admin can restore it in one click.
import { config, requireEnv, TABLES, F, SUBMISSION_NOT_DELETED } from './config.js';
import * as airtable from './airtable.js';
import * as slack from './slack.js';
import { messages } from './messages.js';
import * as unified from './unified.js';
import { combineStats } from './videos.js';
import { syncParticipantTotalViews, findParticipant } from './jobs.js';
import { streakDay, afterDeletingPost } from './streak.js';
import { PENDING_REACTION } from './pending.js';

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

// A failed read leaves that platform out of the rewritten reply rather than failing the restore.
/** @param {AirtableRecord} submission */
async function fetchStats(submission) {
	const { [F.submissions.platform]: platform, [F.submissions.videoId]: videoId } = submission.fields;
	if (!platform || !videoId) return null;
	return unified.fetchPostByPlatformId(platform, videoId).catch((err) => {
		console.error('unified-socials fetch failed on restore', err);
		return null;
	});
}

/** @param {Record<string, any>} fields */
function postReaction(fields) {
	if (fields[F.submissions.pendingCheck]) return PENDING_REACTION;
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

/** @typedef {{ kind: 'delete', channel: string, ts: string, text: string } | { kind: 'unreact' | 'react', channel: string, ts: string, name: string }} SlackCleanup */

// Takes back what a rejected video earned in Slack: its prize thread reply and announcements, and
// the bot's checks on each platform's link, which become an x. Notes and feedback stay.
/**
 * @param {AirtableRecord} primary
 * @returns {Promise<SlackCleanup[]>}
 */
export async function planRejectionCleanup(primary) {
	const fields = primary.fields;
	const channel = fields[F.submissions.channelId];
	if (!channel) return [];
	const bot = await slack.botUserId();
	const group = [primary, ...(await listOtherPlatforms(primary.id, 'TRUE()'))];
	const groupIds = new Set(group.map((s) => s.id));
	const roots = [...new Set(group.map((s) => s.fields[F.submissions.messageTs]).filter(Boolean))];
	const sharing = await airtable.list(TABLES.submissions, {
		filterByFormula: `AND(${SUBMISSION_NOT_DELETED}, OR(${roots.map((ts) => airtable.eq(F.submissions.messageTs, ts)).join(', ')}))`
	});
	const shared = new Set(
		sharing.filter((s) => !groupIds.has(s.id)).map((s) => s.fields[F.submissions.messageTs])
	);
	const slackId = fields[F.submissions.slackId];
	const streak = fields[F.submissions.countedTowardStreak] ? fields[F.submissions.streakAtPost] : null;

	/** @type {SlackCleanup[]} */
	const plan = [];
	const seen = new Set();
	for (const root of roots) {
		for (const m of await slack.threadMessages(channel, root)) {
			if (seen.has(m.ts)) continue;
			seen.add(m.ts);
			if (m.user === bot && streak && m.text?.startsWith(`<@${slackId}> you just unlocked the ${streak}-day prize!`)) {
				plan.push({ kind: 'delete', channel, ts: m.ts, text: m.text });
				continue;
			}
			if (shared.has(root) || !roots.includes(m.ts)) continue;
			for (const r of m.reactions ?? []) {
				if (r.name !== 'x' && r.users?.includes(bot)) plan.push({ kind: 'unreact', channel, ts: m.ts, name: r.name });
			}
			if (!m.reactions?.some((r) => r.name === 'x' && r.users?.includes(bot))) {
				plan.push({ kind: 'react', channel, ts: m.ts, name: 'x' });
			}
		}
	}

	const urls = group.map((s) => s.fields[F.submissions.url]).filter(Boolean);
	const announceChannel = requireEnv('SLACK_ANNOUNCE_CHANNEL_ID', config.announceChannelId);
	const since = String(Date.parse(fields[F.submissions.postedAt]) / 1000);
	for (const m of await slack.historySince(announceChannel, since)) {
		if (m.user !== bot || !m.text) continue;
		const streakAnnounce = streak && m.text.startsWith(`<@${slackId}> just hit a ${streak}-day streak!`);
		const viewsAnnounce =
			m.text.startsWith(`<@${slackId}>'s video just passed`) && urls.some((url) => m.text?.includes(url));
		if (streakAnnounce || viewsAnnounce) plan.push({ kind: 'delete', channel: announceChannel, ts: m.ts, text: m.text });
	}
	return plan;
}

/** @param {SlackCleanup[]} plan */
export async function runRejectionCleanup(plan) {
	for (const step of plan) {
		await bestEffort(`rejection cleanup ${step.kind} failed`, () =>
			step.kind === 'delete'
				? slack.deleteMessage(step.channel, step.ts)
				: step.kind === 'react'
					? slack.addReaction(step.channel, step.ts, step.name)
					: slack.removeReaction(step.channel, step.ts, step.name)
		);
	}
}

// Callers run this inside serialize(), like every other streak write. A rejection by an admin
// undoes the streak the same way, but edits the bot reply and DMs the reason instead.
/**
 * @param {string} submissionId
 * @param {string} slackId
 * @param {{ rejection?: string, reviewer?: string }} [options]
 */
export async function deleteSubmission(submissionId, slackId, { rejection, reviewer } = {}) {
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
		// Marked as rejected so a restore knows the reply was edited, not deleted.
		[F.submissions.preDeleteState]:
			state || rejection ? JSON.stringify({ ...state, ...(rejection ? { rejected: true } : {}) }) : ''
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
		const text = rejection && messages.rejectedReply(rejection, reviewer);
		await bestEffort(rejection ? 'edit bot reply failed' : 'delete bot reply failed', () =>
			text
				? slack.updateMessage(channel, replyTs, text, messages.submissionBlocks(text, participant?.fields))
				: slack.deleteMessage(channel, replyTs)
		);
	}
	if (rejection) {
		await bestEffort('plan rejection cleanup failed', async () =>
			runRejectionCleanup(await planRejectionCleanup(submission))
		);
	} else if (channel && messageTs) {
		await bestEffort('remove reaction failed', () =>
			slack.removeReaction(channel, messageTs, postReaction(fields))
		);
		await bestEffort('add wastebasket failed', () => slack.addReaction(channel, messageTs, 'wastebasket'));
	}
	if (rejection) {
		await bestEffort('rejection dm failed', () =>
			slack.dm(slackId, messages.rejectedDm(fields[F.submissions.day], rejection, reviewer))
		);
	}

	return impact;
}

// Puts the participant back exactly as they were before the delete, overwriting anything since.
// A rejected video's edited reply is rewritten with fresh stats; a deleted reply is not re-posted.
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
	if (state?.participant && participant) {
		await airtable.update(TABLES.participants, participant.id, state.participant);
	}

	await airtable.update(TABLES.submissions, submission.id, {
		[F.submissions.deletedAt]: null,
		[F.submissions.preDeleteState]: ''
	});
	// Only the platforms deleted along with it, matched by the shared timestamp.
	const restored = [submission];
	for (const other of await listOtherPlatforms(submission.id, `{${F.submissions.deletedAt}}`)) {
		if (other.fields[F.submissions.deletedAt] !== fields[F.submissions.deletedAt]) continue;
		await airtable.update(TABLES.submissions, other.id, { [F.submissions.deletedAt]: null });
		restored.push(other);
	}
	if (participant) await syncParticipantTotalViews(participant);

	const channel = fields[F.submissions.channelId];
	const messageTs = fields[F.submissions.messageTs];
	const replyTs = fields[F.submissions.replyMessageTs];
	if (state?.rejected && channel && replyTs) {
		await bestEffort('rewrite rejected reply failed', async () => {
			const stats = combineStats(
				(await Promise.all(restored.map(fetchStats))).filter((post) => post != null)
			);
			const p = participant?.fields ?? {};
			const text = fields[F.submissions.countedTowardStreak]
				? messages.streakUpdate(
						fields[F.submissions.streakAtPost] ?? 0,
						fields[F.submissions.freezesAtPost] ?? 0,
						stats
					)
				: messages.duplicatePost(
						fields[F.submissions.slackId],
						p[F.participants.currentStreak] ?? 0,
						p[F.participants.streakFreezes] ?? 0,
						stats
					);
			await slack.updateMessage(channel, replyTs, text, messages.submissionBlocks(text, participant?.fields));
		});
	}
	if (channel && messageTs) {
		await bestEffort('remove wastebasket failed', () =>
			slack.removeReaction(channel, messageTs, state?.rejected ? 'x' : 'wastebasket')
		);
		await bestEffort('re-add reaction failed', () =>
			slack.addReaction(channel, messageTs, postReaction(fields))
		);
	}
	// A rejection marked each platform's own link too.
	if (state?.rejected) {
		for (const other of restored.slice(1)) {
			const { [F.submissions.channelId]: c, [F.submissions.messageTs]: ts } = other.fields;
			if (!c || !ts || ts === messageTs) continue;
			await bestEffort('restore platform reaction failed', async () => {
				await slack.removeReaction(c, ts, 'x');
				await slack.addReaction(c, ts, 'white_check_mark');
			});
		}
	}
}
