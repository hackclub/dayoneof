import { TABLES, F } from './config.js';
import * as airtable from './airtable.js';
import * as slack from './slack.js';
import { restoreSubmission } from './deletion.js';
import { findParticipant } from './jobs.js';

// Added next to the bot's own reaction so a thread shows how a reviewer judged it. A rejection's x
// comes from deleteSubmission, which clears the rest.
export const REVIEW_REACTIONS = /** @type {Record<string, string>} */ ({
	pass: 'heavy_check_mark',
	warn: 'warning',
	star: 'star'
});

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

// Undoes a review so the video is back in the queue as if no one had looked at it: a rejection is
// restored, and the feedback replies, rejection DM, reaction and warning it left are taken back.
// Callers run this inside serialize(), since restoring a rejection rewrites the streak.
/** @param {string} submissionId */
export async function revertReview(submissionId) {
	const submission = await airtable.get(TABLES.submissions, submissionId);
	const f = submission.fields;
	const slackId = f[F.submissions.slackId];
	const channel = f[F.submissions.channelId];
	const thread = f[F.submissions.messageTs];
	const feedback = /** @type {string} */ (f[F.submissions.reviewFeedback] ?? '');
	const rejected = f[F.submissions.reviewStatus] === 'rejected';
	const bot = await slack.botUserId();

	if (rejected && f[F.submissions.deletedAt]) await restoreSubmission(submissionId);

	if (channel && thread) {
		await bestEffort('delete review feedback failed', async () => {
			const prefix = `<@${slackId}> feedback from the reviewers:`;
			for (const m of await slack.threadMessages(channel, thread)) {
				if (m.user === bot && m.ts !== thread && m.text?.startsWith(prefix)) {
					await slack.deleteMessage(channel, m.ts);
				}
			}
		});
		for (const name of Object.values(REVIEW_REACTIONS)) {
			await bestEffort('remove review reaction failed', () => slack.removeReaction(channel, thread, name));
		}
	}

	if (rejected && f[F.submissions.reviewedAt]) {
		await bestEffort('delete rejection dm failed', async () => {
			const dm = await slack.dmChannel(slackId);
			const since = String(new Date(f[F.submissions.reviewedAt]).getTime() / 1000 - 60);
			for (const m of await slack.historySince(dm, since)) {
				if (m.user === bot && m.text?.startsWith('Your #dayoneof submission on ') && m.text.includes('has been rejected')) {
					await slack.deleteMessage(dm, m.ts);
				}
			}
		});
	}

	const warnings = feedback.split('\n').filter((line) => line.startsWith('Warning: ')).length;
	if (warnings) {
		const participant = await findParticipant(slackId);
		if (participant) {
			await airtable.update(TABLES.participants, participant.id, {
				[F.participants.warnings]: Math.max(0, (participant.fields[F.participants.warnings] ?? 0) - warnings)
			});
		}
	}

	await airtable.update(TABLES.submissions, submissionId, {
		[F.submissions.reviewStatus]: null,
		[F.submissions.reviewedBy]: '',
		[F.submissions.reviewedAt]: null,
		[F.submissions.reviewFeedback]: ''
	});
}
