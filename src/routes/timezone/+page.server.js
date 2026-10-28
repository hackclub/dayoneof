import { fail, redirect } from '@sveltejs/kit';
import { TABLES, F } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import { findParticipant } from '$lib/server/jobs.js';
import { serialize } from '$lib/server/queue.js';

/** @param {string} tz */
function isTimeZone(tz) {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

export async function load({ locals }) {
	if (!locals.session) redirect(302, '/api/auth/login?next=/timezone');
	const participant = await findParticipant(locals.session.slackId);
	return {
		session: locals.session,
		tz: participant?.fields[F.participants.tz] || 'America/New_York',
		confirmed: !!participant?.fields[F.participants.tzConfirmed]
	};
}

export const actions = {
	default: async ({ request, locals }) => {
		if (!locals.session) return fail(401, { error: 'Sign in first.' });
		const slackId = locals.session.slackId;
		const tz = String((await request.formData()).get('tz') ?? '').trim();
		if (!isTimeZone(tz)) return fail(400, { error: 'Pick a timezone from the list.' });

		return serialize(async () => {
			const participant = await findParticipant(slackId);
			if (!participant) return fail(404, { error: "We couldn't find your account. Sign in again." });
			if (participant.fields[F.participants.tzConfirmed]) {
				return fail(409, { error: "Your timezone is already set and can't be changed." });
			}
			await airtable.update(TABLES.participants, participant.id, {
				[F.participants.tz]: tz,
				[F.participants.tzConfirmed]: true
			});
			return { success: true };
		});
	}
};
