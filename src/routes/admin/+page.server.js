import { error, fail, redirect } from '@sveltejs/kit';
import {
	appEnv,
	config,
	isAdmin,
	TABLES,
	SHIPPING_TABLE,
	F,
	PARTICIPANT_HAS_SLACK_ID,
	SUBMISSION_NOT_DELETED
} from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import { runReconcile, runViews, runLeaderboard, runRemind, runBackup } from '$lib/server/jobs.js';
import { fetchPostByPlatformId } from '$lib/server/unified.js';
import { extractLink } from '$lib/server/links.js';
import { isYswsEligible } from '$lib/server/verification.js';
import { deleteSubmission, restoreSubmission, sweepDeletedMessages } from '$lib/server/deletion.js';
import { serialize } from '$lib/server/queue.js';
import { prizesUnlocked, isPostTooOld, isVideoTooShort } from '$lib/server/streak.js';
import { groupByVideo } from '$lib/server/videos.js';
import { runPending, approvePending } from '$lib/server/pending.js';

const LOW_LIKES = 5;
const LOW_LIKES_AFTER_MS = 24 * 60 * 60 * 1000;

/** @param {import('./$types').RequestEvent['locals']} locals */
function requireAdmin(locals) {
	if (!locals.session || !isAdmin(locals.session.slackId)) {
		error(403, "You're not an admin.");
	}
}

/**
 * @param {string} job
 * @param {() => Promise<Record<string, unknown>>} run
 */
async function runJob(job, run) {
	try {
		return { ranJob: job, result: await run() };
	} catch (err) {
		return { ranJob: job, error: err instanceof Error ? err.message : String(err) };
	}
}

export async function load({ locals }) {
	if (!locals.session || !isAdmin(locals.session.slackId)) {
		redirect(302, '/');
	}

	const [participants, allSubmissions, shippingRecords] = await Promise.all([
		airtable.list(TABLES.participants, {
			filterByFormula: PARTICIPANT_HAS_SLACK_ID,
			sort: [{ field: F.participants.currentStreak, direction: 'desc' }]
		}),
		airtable.list(TABLES.submissions),
		// A base that hasn't had setup_airtable.js re-run yet has no shipping table.
		airtable.list(SHIPPING_TABLE).catch((err) => {
			console.error('shipping list failed', err);
			return null;
		})
	]);
	const submissions = allSubmissions.filter((s) => !s.fields[F.submissions.deletedAt]);
	const primaries = submissions.filter((s) => !s.fields[F.submissions.primarySubmission]);
	/** @param {import('$lib/server/airtable.js').AirtableRecord} s */
	const videoKey = (s) => `${s.fields[F.submissions.platform]}:${s.fields[F.submissions.videoId]}`;
	const liveVideos = new Set(submissions.map(videoKey));
	/**
	 * @param {string} field
	 * @param {import('$lib/server/airtable.js').AirtableRecord[]} [from]
	 */
	const flagged = (field, from = allSubmissions) =>
		from
			.filter((s) => s.fields[field])
			.sort((a, b) => (a.fields[field] < b.fields[field] ? 1 : -1))
			.map((s) => ({
				id: s.id,
				slackId: s.fields[F.submissions.slackId],
				url: s.fields[F.submissions.url],
				day: s.fields[F.submissions.day],
				counted: !!s.fields[F.submissions.countedTowardStreak],
				at: s.fields[field],
				deleted: !!s.fields[F.submissions.deletedAt],
				reposted: liveVideos.has(videoKey(s))
			}));

	const videoCountBySlackId = new Map();
	for (const s of primaries) {
		const slackId = s.fields[F.submissions.slackId];
		videoCountBySlackId.set(slackId, (videoCountBySlackId.get(slackId) ?? 0) + 1);
	}

	const starsBySlackId = new Map();
	for (const s of primaries) {
		if (s.fields[F.submissions.reviewStatus] !== 'starred') continue;
		const slackId = s.fields[F.submissions.slackId];
		starsBySlackId.set(slackId, (starsBySlackId.get(slackId) ?? 0) + 1);
	}

	const participantBySlackId = new Map(participants.map((p) => [p.fields[F.participants.slackId], p]));
	const shipping = (shippingRecords ?? [])
		.map((r) => {
			const f = r.fields;
			const participant = participantBySlackId.get(f[F.shipping.slackId]);
			const eligible = prizesUnlocked(participant?.fields[F.participants.lastMilestone]);
			/** @type {string[]} */
			const shipped = f[F.shipping.shippedPrizes] ?? [];
			return {
				id: r.id,
				slackId: f[F.shipping.slackId],
				name: `${f[F.shipping.firstName] ?? ''} ${f[F.shipping.lastName] ?? ''}`.trim(),
				email: f[F.shipping.email] ?? '',
				slackUsername: f[F.shipping.slackUsername] ?? '',
				address: [
					f[F.shipping.addressLine1],
					f[F.shipping.addressLine2],
					[f[F.shipping.city], f[F.shipping.state], f[F.shipping.zip]].filter(Boolean).join(', '),
					f[F.shipping.country]
				].filter(Boolean),
				birthday: f[F.shipping.birthday] ?? '',
				submittedAt: f[F.shipping.submittedAt] ?? '',
				eligible,
				stars: starsBySlackId.get(f[F.shipping.slackId]) ?? 0,
				shipped,
				toShip: eligible.filter((prize) => !shipped.includes(prize))
			};
		})
		.sort((a, b) => b.toShip.length - a.toShip.length || (a.submittedAt < b.submittedAt ? -1 : 1));
	const submittedSlackIds = new Set(shipping.map((s) => s.slackId));

	return {
		canNuke: appEnv !== 'prod',
		shippingMissing: !shippingRecords,
		shipping,
		awaitingAddress: participants
			.map((p) => ({
				slackId: p.fields[F.participants.slackId],
				name: p.fields[F.participants.name],
				prizes: prizesUnlocked(p.fields[F.participants.lastMilestone])
			}))
			.filter((p) => p.prizes.length && !submittedSlackIds.has(p.slackId)),
		videosPosted: primaries.length,
		videosTracked: submissions.filter((s) => s.fields[F.submissions.unifiedId]).length,
		// Other platforms are deleted and restored along with their video, so only videos are listed.
		deletedVideos: flagged(
			F.submissions.deletedAt,
			allSubmissions.filter((s) => !s.fields[F.submissions.primarySubmission])
		),
		noHcMention: submissions
			.filter((s) => s.fields[F.submissions.noHcMention])
			.map((s) => ({
				slackId: s.fields[F.submissions.slackId],
				url: s.fields[F.submissions.url],
				platform: s.fields[F.submissions.platform],
				day: s.fields[F.submissions.day],
				views: s.fields[F.submissions.views] ?? 0
			})),
		metricsUrl: config.goatcounterDashboardUrl ?? null,
		pending: submissions
			.filter((s) => s.fields[F.submissions.pendingCheck])
			.map((s) => ({
				id: s.id,
				slackId: s.fields[F.submissions.slackId],
				url: s.fields[F.submissions.url],
				platform: s.fields[F.submissions.platform],
				day: s.fields[F.submissions.day],
				postedAt: s.fields[F.submissions.postedAt],
				needsReview: !!s.fields[F.submissions.reviewRequestedAt]
			})),
		brokenRules: submissions
			.map((s) => {
				const primaryId = s.fields[F.submissions.primarySubmission];
				const primary = primaryId ? submissions.find((p) => p.id === primaryId) : s;
				const submittedAt = new Date(primary?.fields[F.submissions.postedAt] ?? Date.now());
				const duration = s.fields[F.submissions.durationSeconds];
				const reasons = [
					...(isVideoTooShort(duration, config.minVideoSeconds) ? [`${duration}s long`] : []),
					...(isPostTooOld(s.fields[F.submissions.publishedAt], config.maxPostAgeDays, submittedAt)
						? [`published ${s.fields[F.submissions.publishedAt].slice(0, 10)}`]
						: [])
				];
				return {
					slackId: s.fields[F.submissions.slackId],
					url: s.fields[F.submissions.url],
					platform: s.fields[F.submissions.platform],
					day: s.fields[F.submissions.day],
					counted: !!s.fields[F.submissions.countedTowardStreak],
					reasons
				};
			})
			.filter((s) => s.reasons.length),
		unavailable: submissions
			.filter((s) => s.fields[F.submissions.availability])
			.map((s) => ({
				slackId: s.fields[F.submissions.slackId],
				url: s.fields[F.submissions.url],
				platform: s.fields[F.submissions.platform],
				day: s.fields[F.submissions.day],
				availability: s.fields[F.submissions.availability],
				checkedAt: s.fields[F.submissions.availabilityCheckedAt]
			})),
		// Only videos with a like count from unified-socials on at least one platform are judged.
		lowLikes: groupByVideo(submissions)
			.filter(({ primary, rows }) => {
				const postedAt = Date.parse(primary.fields[F.submissions.postedAt] ?? '');
				const counted = rows.filter((s) => typeof s.fields[F.submissions.likes] === 'number');
				return (
					Date.now() - postedAt >= LOW_LIKES_AFTER_MS &&
					counted.length > 0 &&
					counted.reduce((sum, s) => sum + s.fields[F.submissions.likes], 0) < LOW_LIKES
				);
			})
			.map(({ primary, rows, views }) => ({
				slackId: primary.fields[F.submissions.slackId],
				urls: rows.map((s) => s.fields[F.submissions.url]),
				day: primary.fields[F.submissions.day],
				likes: rows.reduce((sum, s) => sum + (s.fields[F.submissions.likes] ?? 0), 0),
				views
			})),
		repeats: submissions
			.filter((s) => s.fields[F.submissions.repeatOf])
			.map((s) => ({
				id: s.id,
				slackId: s.fields[F.submissions.slackId],
				url: s.fields[F.submissions.url],
				day: s.fields[F.submissions.day],
				counted: !!s.fields[F.submissions.countedTowardStreak],
				repeatOf: s.fields[F.submissions.repeatOf],
				reason: s.fields[F.submissions.repeatReason] ?? ''
			})),
		deletedMessages: flagged(F.submissions.messageDeletedAt),
		participants: participants.map((p) => ({
			id: p.id,
			slackId: p.fields[F.participants.slackId],
			name: p.fields[F.participants.name],
			status: p.fields[F.participants.status] ?? 'notStarted',
			verificationStatus: p.fields[F.participants.verificationStatus] ?? '',
			verified: isYswsEligible(p.fields[F.participants.yswsEligible]),
			currentStreak: p.fields[F.participants.currentStreak] ?? 0,
			streakFreezes: p.fields[F.participants.streakFreezes] ?? 0,
			daysCompleted: p.fields[F.participants.daysCompleted] ?? 0,
			videosPosted: videoCountBySlackId.get(p.fields[F.participants.slackId]) ?? 0,
			totalViews: p.fields[F.participants.totalViews] ?? 0
		}))
	};
}

export const actions = {
	runReconcile: async ({ locals }) => {
		requireAdmin(locals);
		return runJob('reconcile', runReconcile);
	},
	runViews: async ({ locals }) => {
		requireAdmin(locals);
		return runJob('views', runViews);
	},
	runLeaderboard: async ({ locals }) => {
		requireAdmin(locals);
		return runJob('leaderboard', () => runLeaderboard({ force: true }));
	},
	runRemind: async ({ locals }) => {
		requireAdmin(locals);
		return runJob('remind', () => runRemind({ force: true }));
	},
	runPending: async ({ locals }) => {
		requireAdmin(locals);
		return runJob('pending', runPending);
	},
	approvePending: async ({ request, locals }) => {
		requireAdmin(locals);
		const id = String((await request.formData()).get('id'));
		return runJob('count pending', async () => {
			await approvePending(id);
			return { id };
		});
	},
	runBackup: async ({ locals }) => {
		requireAdmin(locals);
		return runJob('backup', runBackup);
	},
	runSweepDeleted: async ({ locals }) => {
		requireAdmin(locals);
		return runJob('sweep deleted messages', sweepDeletedMessages);
	},
	forceVerify: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const id = String(data.get('id'));
		await airtable.update(TABLES.participants, id, {
			[F.participants.verificationStatus]: 'verified',
			[F.participants.yswsEligible]: true
		});
		return { verified: id };
	},
	markShipped: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const id = String(data.get('id'));
		const record = await airtable.get(SHIPPING_TABLE, id);
		const participant = await airtable.find(
			TABLES.participants,
			airtable.eq(F.participants.slackId, record.fields[F.shipping.slackId])
		);
		const eligible = prizesUnlocked(participant?.fields[F.participants.lastMilestone]);
		const shipped = new Set([...(record.fields[F.shipping.shippedPrizes] ?? []), ...eligible]);
		await airtable.update(SHIPPING_TABLE, id, { [F.shipping.shippedPrizes]: [...shipped] });
		return { shipped: id };
	},
	// Kept as 'dismissed' rather than blanked, so the views job doesn't flag the same pair again.
	dismissRepeat: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const id = String(data.get('id'));
		await airtable.update(TABLES.submissions, id, {
			[F.submissions.repeatOf]: '',
			[F.submissions.repeatReason]: 'dismissed'
		});
		return { dismissed: id };
	},
	restoreVideo: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const id = String(data.get('id'));
		await serialize(() => restoreSubmission(id));
		return { restored: id };
	},
	// Another platform's link rejects the video it belongs to, since only that one holds the streak.
	rejectVideo: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const url = String(data.get('url') ?? '').trim();
		const reason = String(data.get('reason') ?? '').trim();
		if (!reason) return fail(400, { rejectError: 'Write a message to send them.' });
		const link = await extractLink(url);
		if (!link) return fail(400, { rejectError: "That doesn't look like a YouTube/TikTok/Instagram link." });
		const found = await airtable.find(
			TABLES.submissions,
			`AND(${airtable.eq(F.submissions.platform, link.platform)}, ${airtable.eq(F.submissions.videoId, link.videoId)}, ${SUBMISSION_NOT_DELETED})`
		);
		if (!found) return fail(404, { rejectError: 'No live submission for that video.' });
		const primaryId = found.fields[F.submissions.primarySubmission] || found.id;
		const slackId = found.fields[F.submissions.slackId];
		const impact = await serialize(() => deleteSubmission(primaryId, slackId, { rejection: reason }));
		if (!impact) return fail(404, { rejectError: 'That video was already deleted.' });
		return { rejected: url, rejectImpact: impact };
	},
	checkStats: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const url = String(data.get('url') ?? '');
		const link = await extractLink(url);
		if (!link) return { statsError: "that doesn't look like a YouTube/TikTok/Instagram link" };
		try {
			const post = await fetchPostByPlatformId(link.platform, link.videoId);
			return { statsChecked: url, stats: post };
		} catch (err) {
			return { statsError: err instanceof Error ? err.message : String(err) };
		}
	},
	nukeAllData: async ({ locals }) => {
		requireAdmin(locals);
		if (appEnv === 'prod') error(403, 'nuking is disabled in prod');
		let deleted = 0;
		for (const table of [...Object.values(TABLES), SHIPPING_TABLE]) {
			const records = await airtable.list(table);
			if (records.length > 0) {
				await airtable.remove(table, records.map((r) => r.id));
				deleted += records.length;
			}
		}
		return { nuked: true, deleted };
	}
};
