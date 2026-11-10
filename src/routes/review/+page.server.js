import { error, fail, redirect } from '@sveltejs/kit';
import { config, isReviewer, isAdmin, TABLES, F, PARTICIPANT_HAS_SLACK_ID } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import * as slack from '$lib/server/slack.js';
import { messages, fromReviewer } from '$lib/server/messages.js';
import { deleteSubmission, deletionPlan, sameDayBackup } from '$lib/server/deletion.js';
import { serialize } from '$lib/server/queue.js';
import { groupByVideo } from '$lib/server/videos.js';
import { isPostTooOld, isVideoTooShort } from '$lib/server/streak.js';
import { approvePending } from '$lib/server/pending.js';
import { findParticipant } from '$lib/server/jobs.js';
import { REVIEW_REACTIONS, revertReview } from '$lib/server/reviews.js';
import { claim, release, decided, undecided } from '$lib/server/presence.js';

/** @typedef {import('$lib/server/airtable.js').AirtableRecord} AirtableRecord */

const LOW_LIKES = 5;
const LOW_LIKES_AFTER_MS = 24 * 60 * 60 * 1000;
const REVIEWED_PAGE = 30;
// Reviewers who aren't admins can only suggest these; an admin makes the call. "Extra decision"
// notes are from before suggestions said which way they leaned.
const ADMIN_ONLY = ['reject', 'star'];
/** @param {string} suggestion */
const suggestPrefix = (suggestion) => `Suggest ${suggestion}: `;
const LEGACY_PREFIX = 'Extra decision: ';
const SUGGESTION_NOTE = /(?:Suggest (reject|star)|Extra decision): ([\s\S]*?) -from <@(\w+)>/g;
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
 * @param {AirtableRecord[]} submissions
 */
function rejection(participant, primary, submissions) {
	if (!primary.fields[F.submissions.countedTowardStreak]) return { impact: 'none', streak: 0, freezes: 0, earnedFreeze: false };
	if (sameDayBackup(submissions, primary)) {
		return {
			impact: 'transfer',
			streak: participant.fields[F.participants.currentStreak] ?? 0,
			freezes: participant.fields[F.participants.streakFreezes] ?? 0,
			earnedFreeze: false
		};
	}
	const plan = deletionPlan(participant, primary, submissions);
	return {
		impact: plan.impact,
		streak: Number(plan.fields[F.participants.currentStreak] ?? 0),
		freezes: Number(
			plan.fields[F.participants.streakFreezes] ?? participant.fields[F.participants.streakFreezes] ?? 0
		),
		earnedFreeze: plan.earnedFreeze
	};
}

export async function load({ locals, url }) {
	const me = locals.session?.slackId ?? '';
	if (!isReviewer(me)) redirect(302, '/');
	const admin = isAdmin(me);
	const showReviewed = url.searchParams.get('show') === 'reviewed';
	const reviewer = url.searchParams.get('reviewer') ?? '';
	const shown = Math.max(REVIEWED_PAGE, Number(url.searchParams.get('limit')) || 0);

	// Cached so the reload after each decision is instant; this process's own writes land in it right away.
	const [participants, allSubmissions] = await Promise.all([
		airtable.listCached(TABLES.participants, { filterByFormula: PARTICIPANT_HAS_SLACK_ID }),
		airtable.listCached(TABLES.submissions, {
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
	// Videos sent for an extra decision only go to admins, who see them first.
	const held = (/** @type {AirtableRecord} */ s) => Number(!!s.fields[F.submissions.pendingCheck]);
	const escalated = (/** @type {AirtableRecord} */ s) => Number(!!s.fields[F.submissions.escalatedAt]);
	const queue = groups
		.filter(({ primary }) => !primary.fields[F.submissions.reviewStatus] && (admin || !escalated(primary)))
		.sort((a, b) => escalated(b.primary) - escalated(a.primary) || held(b.primary) - held(a.primary));
	const allReviewed = allSubmissions
		.filter((s) => s.fields[F.submissions.reviewStatus] && !s.fields[F.submissions.primarySubmission])
		.sort((a, b) => (a.fields[F.submissions.reviewedAt] < b.fields[F.submissions.reviewedAt] ? 1 : -1));
	const filtered = reviewer
		? allReviewed.filter((s) => s.fields[F.submissions.reviewedBy] === reviewer)
		: allReviewed;
	const reviewed = filtered.slice(0, shown);
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
	/** @param {string} text */
	const showMentions = (text) =>
		text.replace(/<@(\w+)>/g, (/** @type {string} */ _, /** @type {string} */ id) => `@${nameOf(id) || id}`);
	/** @param {AirtableRecord} s */
	const showFeedback = (s) => showMentions(s.fields[F.submissions.reviewFeedback] ?? '');
	/** @param {AirtableRecord} s */
	const slackUrlOf = (s) => slack.permalink(s.fields[F.submissions.channelId], s.fields[F.submissions.messageTs]);

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
			slackUrl: slackUrlOf(primary),
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
					slackUrl: slackUrlOf(s),
					status:
						s.fields[F.submissions.reviewStatus] ??
						(s.fields[F.submissions.deletedAt]
							? 'deleted'
							: s.fields[F.submissions.escalatedAt]
								? 'suggested'
								: ''),
					feedback: showFeedback(s)
				})),
			escalation: f[F.submissions.escalatedAt]
				? {
						byName: nameOf(f[F.submissions.escalatedBy] ?? '') || f[F.submissions.escalatedBy],
						// text is the raw note an admin can reuse; shown has names in place of mentions.
						notes: [...String(f[F.submissions.reviewFeedback] ?? '').matchAll(SUGGESTION_NOTE)].map(
							([, suggest, text, by]) => ({
								suggest: suggest ?? '',
								text,
								by,
								byName: nameOf(by) || by,
								shown: showMentions(text)
							})
						)
					}
				: null,
			rejection: participant
				? rejection(participant, primary, allSubmissions)
				: { impact: 'none', streak: 0, freezes: 0, earnedFreeze: false }
		};
	});

	return {
		videos,
		me,
		admin,
		names: Object.fromEntries(config.reviewerSlackIds.map((id) => [id, nameOf(id) || id])),
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
					slackUrl: slackUrlOf(s),
					status: s.fields[F.submissions.reviewStatus],
					by: s.fields[F.submissions.reviewedBy] ?? '',
					byName: nameOf(s.fields[F.submissions.reviewedBy] ?? ''),
					at: s.fields[F.submissions.reviewedAt] ?? '',
					feedback: showFeedback(s)
				}))
			: [],
		moreReviewed: showReviewed && filtered.length > shown
	};
}

export const actions = {
	review: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals);
		const data = await request.formData();
		const id = String(data.get('id'));
		const decision = String(data.get('decision'));
		const feedback = String(data.get('feedback') ?? '').trim();
		const author = String(data.get('author') ?? '');
		const admin = isAdmin(reviewer);
		if (author && !admin) return fail(403, { error: 'Only admins can approve a suggestion.' });
		const suggestion = !admin && ADMIN_ONLY.includes(decision) ? decision : '';

		if (!claim(id)) return fail(409, { error: 'Another reviewer is submitting a decision on that video right now.' });
		try {
			return await decide({
				id,
				decision: suggestion ? 'suggest' : decision,
				suggestion,
				feedback,
				approver: reviewer,
				admin,
				author
			});
		} finally {
			release(id);
		}
	},
	revert: async ({ request, locals }) => {
		requireReviewer(locals);
		const id = String((await request.formData()).get('id'));
		if (!claim(id)) return fail(409, { error: 'Another reviewer is working on that video right now.' });
		try {
			await serialize(() => revertReview(id));
		} finally {
			release(id);
		}
		undecided(id);
		return { reverted: id };
	}
};

// With an author, an admin is approving that reviewer's suggestion, so it goes out as theirs.
/**
 * @param {{ id: string, decision: string, suggestion: string, feedback: string, approver: string, admin: boolean, author: string }} review
 */
async function decide({ id, decision, suggestion, feedback, approver, admin, author }) {
	const submission = await airtable.get(TABLES.submissions, id);
	const f = submission.fields;
	const saved = String(f[F.submissions.reviewFeedback] ?? '');
	const suggested = (/** @type {string} */ prefix) => saved.includes(`${prefix}${feedback}${fromReviewer(author)}`);
	if (author && !suggested(suggestPrefix(decision)) && !suggested(LEGACY_PREFIX)) {
		return fail(409, { error: "That suggestion doesn't match what's saved anymore." });
	}
	const reviewer = author || approver;
	if (f[F.submissions.deletedAt]) return fail(409, { error: 'That video was already deleted.' });
	if (f[F.submissions.reviewStatus]) {
		const by = f[F.submissions.reviewedBy];
		return fail(409, { error: `That video was already reviewed${by && by !== reviewer ? ' by someone else' : ''}.` });
	}
	if (f[F.submissions.escalatedAt] && !admin) {
		return fail(409, { error: 'That video was already sent to an admin.' });
	}
	const prefixes = /** @type {Record<string, string>} */ ({ warn: 'Warning: ', suggest: suggestPrefix(suggestion) });
	const note = `${prefixes[decision] ?? ''}${feedback}${fromReviewer(reviewer)}`;
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
	} else if (decision === 'reject' || (decision === 'suggest' && suggestion === 'reject')) {
		if (!feedback) return fail(400, { error: 'Rejecting needs a reason, written in the feedback box.' });
		if (decision === 'reject') await serialize(() => deleteSubmission(id, slackId, { rejection: feedback, reviewer }));
	} else if (decision !== 'suggest') {
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
		// A suggestion is saved even without a message, so admins can see which way it leaned.
		...(feedback || decision === 'suggest'
			? { [F.submissions.reviewFeedback]: previous ? `${previous}\n${note}` : note }
			: {}),
		...(decision === 'suggest'
			? { [F.submissions.escalatedBy]: reviewer, [F.submissions.escalatedAt]: new Date().toISOString() }
			: {})
	});
	if (decision !== 'feedback') decided(id, approver, suggestion ? `suggest-${suggestion}` : decision);
	if (REVIEW_REACTIONS[decision]) {
		await slack.addReaction(channel, thread, REVIEW_REACTIONS[decision]).catch((err) => {
			console.error('review reaction failed', err);
		});
	}
	return { done: decision };
}
