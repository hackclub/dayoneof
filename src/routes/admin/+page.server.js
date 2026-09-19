import { error, redirect } from '@sveltejs/kit';
import { isAdmin, TABLES, F } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import { runReconcile, runLeaderboard, runRemind } from '$lib/server/jobs.js';

/** @param {import('./$types').RequestEvent['locals']} locals */
function requireAdmin(locals) {
	if (!locals.session || !isAdmin(locals.session.slackId)) {
		error(403, 'not an admin');
	}
}

export async function load({ locals }) {
	if (!locals.session || !isAdmin(locals.session.slackId)) {
		redirect(302, '/');
	}

	const participants = await airtable.list(TABLES.participants, {
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
		return { ranJob: 'reconcile', result: await runReconcile() };
	},
	runLeaderboard: async ({ locals }) => {
		requireAdmin(locals);
		return { ranJob: 'leaderboard', result: await runLeaderboard() };
	},
	runRemind: async ({ locals }) => {
		requireAdmin(locals);
		return { ranJob: 'remind', result: await runRemind() };
	},
	adjustParticipant: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const id = String(data.get('id'));

		/** @type {Record<string, any>} */
		const fields = {};
		const currentStreak = data.get('currentStreak');
		const streakFreezes = data.get('streakFreezes');
		const status = data.get('status');
		if (currentStreak !== null && currentStreak !== '') fields[F.participants.currentStreak] = Number(currentStreak);
		if (streakFreezes !== null && streakFreezes !== '') fields[F.participants.streakFreezes] = Number(streakFreezes);
		if (status) fields[F.participants.status] = String(status);

		await airtable.update(TABLES.participants, id, fields);
		return { adjusted: id };
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
