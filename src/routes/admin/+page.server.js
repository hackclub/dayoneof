import { error, redirect } from '@sveltejs/kit';
import { isAdmin, TABLES, F, PARTICIPANT_HAS_SLACK_ID } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import { runReconcile, runLeaderboard, runRemind } from '$lib/server/jobs.js';
import { fetchPostByPlatformId } from '$lib/server/unified.js';
import { extractLink } from '$lib/server/links.js';

/** @param {import('./$types').RequestEvent['locals']} locals */
function requireAdmin(locals) {
	if (!locals.session || !isAdmin(locals.session.slackId)) {
		error(403, 'not an admin');
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

	const [participants, submissions] = await Promise.all([
		airtable.list(TABLES.participants, {
			filterByFormula: PARTICIPANT_HAS_SLACK_ID,
			sort: [{ field: F.participants.currentStreak, direction: 'desc' }]
		}),
		airtable.list(TABLES.submissions)
	]);

	const videoCountBySlackId = new Map();
	for (const s of submissions) {
		const slackId = s.fields[F.submissions.slackId];
		videoCountBySlackId.set(slackId, (videoCountBySlackId.get(slackId) ?? 0) + 1);
	}

	return {
		videosPosted: submissions.length,
		videosTracked: submissions.filter((s) => s.fields[F.submissions.unifiedId]).length,
		participants: participants.map((p) => ({
			id: p.id,
			slackId: p.fields[F.participants.slackId],
			name: p.fields[F.participants.name],
			status: p.fields[F.participants.status] ?? 'notStarted',
			verificationStatus: p.fields[F.participants.verificationStatus] ?? '',
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
	runLeaderboard: async ({ locals }) => {
		requireAdmin(locals);
		return runJob('leaderboard', runLeaderboard);
	},
	runRemind: async ({ locals }) => {
		requireAdmin(locals);
		// DMs literally everyone, ignoring hour/posted-today/already-reminded — the real hourly
		// cron always calls runRemind() with no options.
		return runJob('remind', () => runRemind({ force: true }));
	},
	forceVerify: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const id = String(data.get('id'));
		await airtable.update(TABLES.participants, id, {
			[F.participants.verificationStatus]: 'verified_eligible'
		});
		return { verified: id };
	},
	// Replaces the old Slack `debug stats` command — paste any submitted video's URL to see its
	// live unified-socials lookup result without waiting for the nightly reconcile pass.
	checkStats: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const url = String(data.get('url') ?? '');
		const link = extractLink(url);
		if (!link) return { statsError: "that doesn't look like a YouTube/TikTok/Instagram link" };
		try {
			const post = await fetchPostByPlatformId(link.platform, link.videoId);
			return { statsChecked: url, stats: post };
		} catch (err) {
			return { statsError: err instanceof Error ? err.message : String(err) };
		}
	},
	// Deletes every row in every table — for wiping test data, nothing else. Confirmed
	// client-side (see +page.svelte) since there's no undo.
	nukeAllData: async ({ locals }) => {
		requireAdmin(locals);
		let deleted = 0;
		for (const table of Object.values(TABLES)) {
			const records = await airtable.list(table);
			if (records.length > 0) {
				await airtable.remove(table, records.map((r) => r.id));
				deleted += records.length;
			}
		}
		return { nuked: true, deleted };
	}
};
