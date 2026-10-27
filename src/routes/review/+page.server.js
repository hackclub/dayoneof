import { error, fail, redirect } from '@sveltejs/kit';
import { config, isReviewer, TABLES, F, PARTICIPANT_HAS_SLACK_ID } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import * as slack from '$lib/server/slack.js';
import { messages } from '$lib/server/messages.js';
import { deleteSubmission, deletionPlan } from '$lib/server/deletion.js';
import { serialize } from '$lib/server/queue.js';
import { groupByVideo } from '$lib/server/videos.js';
import { isPostTooOld, isVideoTooShort } from '$lib/server/streak.js';

/** @typedef {import('$lib/server/airtable.js').AirtableRecord} AirtableRecord */

const LOW_LIKES = 5;
const LOW_LIKES_AFTER_MS = 24 * 60 * 60 * 1000;
const REVIEWED_SHOWN = 30;

/** @type {Record<string, (id: string) => string>} */
const EMBEDS = {
	youtube: (id) => `https://www.youtube.com/embed/${id}`,
	tiktok: (id) => `https://www.tiktok.com/embed/v2/${id}`,
	instagram: (id) => `https://www.instagram.com/p/${id}/embed/`
};

/** @param {import('./$types').RequestEvent['locals']} locals */
function requireReviewer(locals) {
	if (!isReviewer(locals.session?.slackId)) error(403, "You're not a reviewer.");
	return /** @type {string} */ (locals.session?.slackId);
}

/**
 * @param {AirtableRecord} primary
 * @param {AirtableRecord[]} rows
 */
function flagsFor(primary, rows) {
	const submittedAt = new Date(primary.fields[F.submissions.postedAt]);
	const old = Date.now() - submittedAt.getTime() > LOW_LIKES_AFTER_MS;
	/** @type {string[]} */
	const flags = [];
	if (!primary.fields[F.submissions.countedTowardStreak]) flags.push("extra post, didn't count");
	for (const s of rows) {
		const f = s.fields;
		const on = rows.length > 1 ? ` (${f[F.submissions.platform]})` : '';
		if (f[F.submissions.noHcMention]) flags.push(`no Hack Club mention found${on}`);
		if (f[F.submissions.repeatOf] && f[F.submissions.repeatReason] !== 'dismissed') {
			flags.push(`possible repeat of ${f[F.submissions.repeatOf]}: ${f[F.submissions.repeatReason]}${on}`);
		}
		if (f[F.submissions.availability]) flags.push(`${f[F.submissions.availability]}${on}`);
		if (isVideoTooShort(f[F.submissions.durationSeconds], config.minVideoSeconds)) {
			flags.push(`${f[F.submissions.durationSeconds]}s long${on}`);
		}
		if (isPostTooOld(f[F.submissions.publishedAt], config.maxPostAgeDays, submittedAt)) {
			flags.push(`published ${f[F.submissions.publishedAt].slice(0, 10)}${on}`);
		}
	}
	const likes = rows.reduce((sum, s) => sum + (s.fields[F.submissions.likes] ?? 0), 0);
	if (old && likes < LOW_LIKES) flags.push(`${likes} likes after 24 hours`);
	return flags;
}

/**
 * @param {AirtableRecord} participant
 * @param {AirtableRecord} primary
 */
function rejection(participant, primary) {
	if (!primary.fields[F.submissions.countedTowardStreak]) return { impact: 'none', streak: 0, freezes: 0 };
	const plan = deletionPlan(participant, primary);
	return {
		impact: plan.impact,
		streak: Number(plan.fields[F.participants.currentStreak] ?? 0),
		freezes: Number(
			plan.fields[F.participants.streakFreezes] ?? participant.fields[F.participants.streakFreezes] ?? 0
		)
	};
}

export async function load({ locals, url }) {
	if (!isReviewer(locals.session?.slackId)) redirect(302, '/');
	const showReviewed = url.searchParams.get('show') === 'reviewed';

	const [participants, allSubmissions] = await Promise.all([
		airtable.list(TABLES.participants, { filterByFormula: PARTICIPANT_HAS_SLACK_ID }),
		airtable.list(TABLES.submissions, {
			sort: [{ field: F.submissions.postedAt, direction: 'asc' }]
		})
	]);
	const byId = new Map(participants.map((p) => [p.fields[F.participants.slackId], p]));
	const live = allSubmissions.filter(
		(s) => !s.fields[F.submissions.deletedAt] && !s.fields[F.submissions.pendingCheck]
	);
	const groups = groupByVideo(live);
	const queue = groups.filter(({ primary }) => !primary.fields[F.submissions.reviewStatus]);
	const reviewed = allSubmissions
		.filter((s) => s.fields[F.submissions.reviewStatus] && !s.fields[F.submissions.primarySubmission])
		.sort((a, b) => (a.fields[F.submissions.reviewedAt] < b.fields[F.submissions.reviewedAt] ? 1 : -1))
		.slice(0, REVIEWED_SHOWN);

	const videos = queue.map(({ primary, rows, views }) => {
		const f = primary.fields;
		const participant = byId.get(f[F.submissions.slackId]);
		const archived = rows.find((s) => s.fields[F.submissions.archiveUrl]);
		return {
			id: primary.id,
			slackId: f[F.submissions.slackId],
			name: participant?.fields[F.participants.name] ?? f[F.submissions.slackId],
			title: f[F.submissions.title] ?? '',
			thumbnail: f[F.submissions.thumbnailUrl] ?? '',
			day: f[F.submissions.day],
			postedAt: f[F.submissions.postedAt],
			streakAtPost: f[F.submissions.streakAtPost] ?? null,
			views,
			slackUrl: slack.permalink(f[F.submissions.channelId], f[F.submissions.messageTs]),
			archiveUrl: archived?.fields[F.submissions.archiveUrl] ?? '',
			embedUrl: EMBEDS[f[F.submissions.platform]]?.(f[F.submissions.videoId]) ?? '',
			platforms: rows.map((s) => ({
				platform: s.fields[F.submissions.platform],
				url: s.fields[F.submissions.url],
				views: s.fields[F.submissions.views] ?? 0
			})),
			flags: flagsFor(primary, rows),
			currentStreak: participant?.fields[F.participants.currentStreak] ?? 0,
			rejection: participant
				? rejection(participant, primary)
				: { impact: 'none', streak: 0, freezes: 0 }
		};
	});

	return {
		videos,
		showReviewed,
		reviewed: showReviewed
			? reviewed.map((s) => ({
					slackId: s.fields[F.submissions.slackId],
					name: byId.get(s.fields[F.submissions.slackId])?.fields[F.participants.name] ?? '',
					url: s.fields[F.submissions.url],
					status: s.fields[F.submissions.reviewStatus],
					by: s.fields[F.submissions.reviewedBy] ?? '',
					at: s.fields[F.submissions.reviewedAt] ?? '',
					feedback: s.fields[F.submissions.reviewFeedback] ?? ''
				}))
			: []
	};
}

export const actions = {
	review: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals);
		const data = await request.formData();
		const id = String(data.get('id'));
		const decision = String(data.get('decision'));
		const feedback = String(data.get('feedback') ?? '').trim();

		const submission = await airtable.get(TABLES.submissions, id);
		const f = submission.fields;
		if (f[F.submissions.deletedAt]) return fail(409, { error: 'That video was already deleted.' });
		const slackId = f[F.submissions.slackId];
		const channel = f[F.submissions.channelId];
		const thread = f[F.submissions.messageTs];

		if (decision === 'feedback' || decision === 'pass' || decision === 'star') {
			if (decision === 'feedback' && !feedback) return fail(400, { error: 'Write some feedback first.' });
			if (feedback) await slack.postMessage(channel, messages.reviewFeedback(slackId, feedback), thread);
		} else if (decision === 'reject') {
			if (!feedback) return fail(400, { error: 'Rejecting needs a reason, written in the feedback box.' });
			await serialize(() => deleteSubmission(id, slackId, { rejection: feedback }));
		} else {
			return fail(400, { error: 'Unknown decision.' });
		}

		/** @type {Record<string, string>} */
		const statuses = { pass: 'passed', star: 'starred', reject: 'rejected' };
		const status = statuses[decision];
		const previous = f[F.submissions.reviewFeedback];
		await airtable.update(TABLES.submissions, id, {
			...(status
				? {
						[F.submissions.reviewStatus]: status,
						[F.submissions.reviewedBy]: reviewer,
						[F.submissions.reviewedAt]: new Date().toISOString()
					}
				: {}),
			...(feedback
				? { [F.submissions.reviewFeedback]: previous ? `${previous}\n${feedback}` : feedback }
				: {})
		});
		return { done: decision };
	}
};
