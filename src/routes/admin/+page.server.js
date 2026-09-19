import { error, redirect } from '@sveltejs/kit';
import { isAdmin, TABLES, F, PARTICIPANT_HAS_SLACK_ID } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import { runReconcile, runLeaderboard, runRemind } from '$lib/server/jobs.js';

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

	const participants = await airtable.list(TABLES.participants, {
		filterByFormula: PARTICIPANT_HAS_SLACK_ID,
		sort: [{ field: F.participants.currentStreak, direction: 'desc' }]
	});

	return {
		participants: participants.map((p) => ({
			id: p.id,
			slackId: p.fields[F.participants.slackId],
			name: p.fields[F.participants.name],
			status: p.fields[F.participants.status] ?? 'notStarted',
			verificationStatus: p.fields[F.participants.verificationStatus] ?? '',
			currentStreak: p.fields[F.participants.currentStreak] ?? 0,
			streakFreezes: p.fields[F.participants.streakFreezes] ?? 0,
			daysCompleted: p.fields[F.participants.daysCompleted] ?? 0,
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
	}
};
