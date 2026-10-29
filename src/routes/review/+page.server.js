import { error, fail, redirect } from '@sveltejs/kit';
import { config, isReviewer, TABLES, F, PARTICIPANT_HAS_SLACK_ID } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import * as slack from '$lib/server/slack.js';
import { messages, fromReviewer } from '$lib/server/messages.js';
import { deleteSubmission, deletionPlan } from '$lib/server/deletion.js';
import { serialize } from '$lib/server/queue.js';
import { groupByVideo } from '$lib/server/videos.js';
import { isPostTooOld, isVideoTooShort } from '$lib/server/streak.js';
import { approvePending } from '$lib/server/pending.js';
import { findParticipant } from '$lib/server/jobs.js';
import { REVIEW_REACTIONS, revertReview } from '$lib/server/reviews.js';

/** @typedef {import('$lib/server/airtable.js').AirtableRecord} AirtableRecord */

const LOW_LIKES = 5;
const LOW_LIKES_AFTER_MS = 24 * 60 * 60 * 1000;
const REVIEWED_SHOWN = 30;
const UNIFIED_WEB_URL = config.unifiedSocialsApiUrl.replace(/\/api\/v1\/?$/, '');

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
	if (primary.fields[F.submissions.pendingCheck]) flags.push("bot couldn't verify, passing counts it for its day");
	else if (!primary.fields[F.submissions.countedTowardStreak]) flags.push("extra post, didn't count");
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
	const reviewer = url.searchParams.get('reviewer') ?? '';

	const [participants, allSubmissions] = await Promise.all([
		airtable.list(TABLES.participants, { filterByFormula: PARTICIPANT_HAS_SLACK_ID }),
		airtable.list(TABLES.submissions, {
			sort: [{ field: F.submissions.postedAt, direction: 'asc' }]
		})
	]);
	const byId = new Map(participants.map((p) => [p.fields[F.participants.slackId], p]));
	// Held posts the bot gave up on are reviewable too, and go first since a streak waits on them.
	const live = allSubmissions.filter(
		(s) =>
			!s.fields[F.submissions.deletedAt] &&
			(!s.fields[F.submissions.pendingCheck] || s.fields[F.submissions.reviewRequestedAt])
	);
	const groups = groupByVideo(live);
	const held = (/** @type {AirtableRecord} */ s) => Number(!!s.fields[F.submissions.pendingCheck]);
	const queue = groups
		.filter(({ primary }) => !primary.fields[F.submissions.reviewStatus])
		.sort((a, b) => held(b.primary) - held(a.primary));
	const allReviewed = allSubmissions
		.filter((s) => s.fields[F.submissions.reviewStatus] && !s.fields[F.submissions.primarySubmission])
		.sort((a, b) => (a.fields[F.submissions.reviewedAt] < b.fields[F.submissions.reviewedAt] ? 1 : -1));
	const reviewed = reviewer
		? allReviewed.filter((s) => s.fields[F.submissions.reviewedBy] === reviewer)
		: allReviewed.slice(0, REVIEWED_SHOWN);
	/** @type {Map<string, Record<string, number>>} */
	const tallies = new Map();
	for (const s of allReviewed) {
		const by = s.fields[F.submissions.reviewedBy] ?? '';
		const tally = tallies.get(by) ?? {};
		const status = s.fields[F.submissions.reviewStatus];
		tally[status] = (tally[status] ?? 0) + 1;
		tallies.set(by, tally);
	}
	/** @param {string} slackId */
	const nameOf = (slackId) => byId.get(slackId)?.fields[F.participants.name] ?? '';
	/** @param {AirtableRecord} s */
	const showFeedback = (s) =>
		(s.fields[F.submissions.reviewFeedback] ?? '').replace(
			/<@(\w+)>/g,
			(/** @type {string} */ _, /** @type {string} */ id) => `@${nameOf(id) || id}`
		);

	/** @type {Map<string, AirtableRecord[]>} */
	const postsBy = new Map();
	for (const s of allSubmissions) {
		if (s.fields[F.submissions.primarySubmission]) continue;
		const slackId = s.fields[F.submissions.slackId];
		postsBy.set(slackId, [...(postsBy.get(slackId) ?? []), s]);
	}

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
			unifiedUrl: f[F.submissions.unifiedId]
				? `${UNIFIED_WEB_URL}/posts/${f[F.submissions.platform]}-${f[F.submissions.videoId]}`
				: '',
			archiveUrl: archived?.fields[F.submissions.archiveUrl] ?? '',
			embedUrl: EMBEDS[f[F.submissions.platform]]?.(f[F.submissions.videoId]) ?? '',
			platforms: rows.map((s) => ({
				platform: s.fields[F.submissions.platform],
				url: s.fields[F.submissions.url],
				views: s.fields[F.submissions.views] ?? 0
			})),
			flags: flagsFor(primary, rows),
			currentStreak: participant?.fields[F.participants.currentStreak] ?? 0,
			warnings: participant?.fields[F.participants.warnings] ?? 0,
			history: (postsBy.get(f[F.submissions.slackId]) ?? [])
				.filter((s) => s.id !== primary.id)
				.reverse()
				.map((s) => ({
					day: s.fields[F.submissions.day],
					url: s.fields[F.submissions.url],
					title: s.fields[F.submissions.title] ?? '',
					status: s.fields[F.submissions.reviewStatus] ?? (s.fields[F.submissions.deletedAt] ? 'deleted' : ''),
					feedback: showFeedback(s)
				})),
			rejection: participant
				? rejection(participant, primary)
				: { impact: 'none', streak: 0, freezes: 0 }
		};
	});

	return {
		videos,
		showReviewed,
		reviewer,
		reviewers: showReviewed
			? [...tallies]
					.map(([slackId, tally]) => ({
						slackId,
						name: nameOf(slackId),
						tally,
						total: Object.values(tally).reduce((sum, n) => sum + n, 0)
					}))
					.sort((a, b) => b.total - a.total)
			: [],
		reviewed: showReviewed
			? reviewed.map((s) => ({
					id: s.id,
					slackId: s.fields[F.submissions.slackId],
					name: nameOf(s.fields[F.submissions.slackId]),
					url: s.fields[F.submissions.url],
					status: s.fields[F.submissions.reviewStatus],
					by: s.fields[F.submissions.reviewedBy] ?? '',
					byName: nameOf(s.fields[F.submissions.reviewedBy] ?? ''),
					at: s.fields[F.submissions.reviewedAt] ?? '',
					feedback: showFeedback(s)
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
		if (f[F.submissions.reviewStatus]) return fail(409, { error: 'That video was already reviewed.' });
		const note = `${decision === 'warn' ? `Warning: ${feedback}` : feedback}${fromReviewer(reviewer)}`;
		const previous = f[F.submissions.reviewFeedback];
		if (feedback && previous?.split('\n').includes(note)) {
			return fail(409, { error: 'That feedback was already sent.' });
		}
		const slackId = f[F.submissions.slackId];
		const channel = f[F.submissions.channelId];
		const thread = f[F.submissions.messageTs];

		if (decision === 'feedback' || decision === 'pass' || decision === 'star' || decision === 'warn') {
			if ((decision === 'feedback' || decision === 'warn') && !feedback) {
				return fail(400, { error: 'Write some feedback first.' });
			}
			if (decision !== 'feedback' && f[F.submissions.pendingCheck]) await approvePending(id);
			if (feedback) await slack.postMessage(channel, messages.reviewFeedback(slackId, feedback, reviewer), thread);
			if (decision === 'warn') {
				const participant = await findParticipant(slackId);
				if (participant) {
					await airtable.update(TABLES.participants, participant.id, {
						[F.participants.warnings]: (participant.fields[F.participants.warnings] ?? 0) + 1
					});
				}
			}
		} else if (decision === 'reject') {
			if (!feedback) return fail(400, { error: 'Rejecting needs a reason, written in the feedback box.' });
			await serialize(() => deleteSubmission(id, slackId, { rejection: feedback, reviewer }));
		} else {
			return fail(400, { error: 'Unknown decision.' });
		}

		/** @type {Record<string, string>} */
		const statuses = { pass: 'passed', warn: 'passed', star: 'starred', reject: 'rejected' };
		const status = statuses[decision];
		await airtable.update(TABLES.submissions, id, {
			...(status
				? {
						[F.submissions.reviewStatus]: status,
						[F.submissions.reviewedBy]: reviewer,
						[F.submissions.reviewedAt]: new Date().toISOString()
					}
				: {}),
			...(feedback
				? { [F.submissions.reviewFeedback]: previous ? `${previous}\n${note}` : note }
				: {})
		});
		if (REVIEW_REACTIONS[decision]) {
			await slack.addReaction(channel, thread, REVIEW_REACTIONS[decision]).catch((err) => {
				console.error('review reaction failed', err);
			});
		}
		return { done: decision };
	},
	revert: async ({ request, locals }) => {
		requireReviewer(locals);
		const id = String((await request.formData()).get('id'));
		await serialize(() => revertReview(id));
		return { reverted: id };
	}
};
