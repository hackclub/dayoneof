import { fail } from '@sveltejs/kit';
import { F } from '$lib/server/config.js';
import { findParticipant } from '$lib/server/jobs.js';
import { findShipping, saveShipping } from '$lib/server/shipping.js';
import { prizesUnlocked } from '$lib/server/streak.js';
import { validateShipping } from '$lib/regions';

const MAX_LENGTH = 200;

export async function load({ locals }) {
	const session = locals.session;
	if (!session) return { session, prizes: /** @type {string[]} */ ([]), saved: null };

	const [participant, shipping] = await Promise.all([
		findParticipant(session.slackId),
		findShipping(session.slackId)
	]);
	const s = shipping?.fields ?? {};
	return {
		session,
		prizes: prizesUnlocked(participant?.fields[F.participants.lastMilestone]),
		saved: {
			submitted: !!shipping,
			firstName: s[F.shipping.firstName] ?? '',
			lastName: s[F.shipping.lastName] ?? '',
			email: s[F.shipping.email] ?? participant?.fields[F.participants.email] ?? '',
			slackUsername: s[F.shipping.slackUsername] ?? participant?.fields[F.participants.name] ?? '',
			addressLine1: s[F.shipping.addressLine1] ?? '',
			addressLine2: s[F.shipping.addressLine2] ?? '',
			city: s[F.shipping.city] ?? '',
			state: s[F.shipping.state] ?? '',
			zip: s[F.shipping.zip] ?? '',
			country: s[F.shipping.country] ?? '',
			birthday: s[F.shipping.birthday] ?? ''
		}
	};
}

export const actions = {
	default: async ({ request, locals }) => {
		if (!locals.session) return fail(401, { error: 'Sign in first.' });
		const slackId = locals.session.slackId;

		const data = await request.formData();
		/** @param {string} name */
		const field = (name) => String(data.get(name) ?? '').trim().slice(0, MAX_LENGTH);
		const values = {
			firstName: field('firstName'),
			lastName: field('lastName'),
			email: field('email').toLowerCase(),
			slackUsername: field('slackUsername').replace(/^@/, ''),
			addressLine1: field('addressLine1'),
			addressLine2: field('addressLine2'),
			city: field('city'),
			state: field('state'),
			zip: field('zip'),
			country: field('country'),
			birthday: field('birthday')
		};

		const errors = validateShipping(values);
		if (Object.keys(errors).length) return fail(400, { errors, values });

		const participant = await findParticipant(slackId);
		if (!prizesUnlocked(participant?.fields[F.participants.lastMilestone]).length) {
			return fail(403, { error: "You haven't unlocked a prize yet.", values });
		}

		await saveShipping(
			slackId,
			Object.fromEntries(
				Object.entries(values).map(([key, value]) => [F.shipping[/** @type {keyof typeof values} */ (key)], value])
			)
		);
		return { success: true };
	}
};
