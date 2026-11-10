import { fail } from '@sveltejs/kit';
import { FEEDBACK_TABLE, F } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import { findParticipant } from '$lib/server/jobs.js';

const MAX_LENGTH = 2000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Anyone can submit without signing in, so each address gets a few tries an hour.
const LIMIT_PER_HOUR = 5;
/** @type {Map<string, number[]>} */
const recent = new Map();

/** @param {string} address */
function rateLimited(address) {
	const hourAgo = Date.now() - 60 * 60 * 1000;
	const times = (recent.get(address) ?? []).filter((t) => t > hourAgo);
	recent.set(address, [...times, Date.now()]);
	return times.length >= LIMIT_PER_HOUR;
}

/** @param {string} slackId */
const findFeedback = (slackId) => airtable.find(FEEDBACK_TABLE, airtable.eq(F.feedback.slackId, slackId));

export async function load({ locals }) {
	const session = locals.session;
	if (!session) return { session, saved: null };

	const [participant, feedback] = await Promise.all([findParticipant(session.slackId), findFeedback(session.slackId)]);
	const f = feedback?.fields ?? {};
	return {
		session,
		saved: {
			submitted: !!feedback,
			score: f[F.feedback.score] ? String(f[F.feedback.score]) : '',
			heardFrom: f[F.feedback.heardFrom] ?? '',
			doingWell: f[F.feedback.doingWell] ?? '',
			doBetter: f[F.feedback.doBetter] ?? '',
			email: f[F.feedback.email] ?? participant?.fields[F.participants.email] ?? '',
			otherFeedback: f[F.feedback.otherFeedback] ?? ''
		}
	};
}

export const actions = {
	default: async ({ request, locals, getClientAddress }) => {
		const data = await request.formData();
		// A field people can't see, so bots that fill in everything are dropped quietly.
		if (String(data.get('website') ?? '')) return { success: true };
		const slackId = data.get('anonymous') ? '' : (locals.session?.slackId ?? '');
		/** @param {string} name */
		const field = (name) => String(data.get(name) ?? '').trim().slice(0, MAX_LENGTH);
		const values = {
			score: field('score'),
			heardFrom: field('heardFrom'),
			doingWell: field('doingWell'),
			doBetter: field('doBetter'),
			email: field('email').toLowerCase(),
			otherFeedback: field('otherFeedback')
		};

		/** @type {Record<string, string>} */
		const errors = {};
		const score = Number(values.score);
		if (!Number.isInteger(score) || score < 1 || score > 10) errors.score = 'Pick a number from 1 to 10.';
		if (!values.heardFrom) errors.heardFrom = 'Tell us where you heard about it.';
		if (values.email && !EMAIL.test(values.email)) errors.email = "That email doesn't look right.";
		if (Object.keys(errors).length) return fail(400, { errors, values });
		if (rateLimited(getClientAddress())) {
			return fail(429, { error: "That's a lot of answers at once. Try again in an hour.", values });
		}

		const participant = slackId ? await findParticipant(slackId) : null;
		const p = participant?.fields ?? {};
		const record = {
			[F.feedback.slackId]: slackId,
			[F.feedback.name]: p[F.participants.name] ?? '',
			[F.feedback.email]: values.email || null,
			[F.feedback.score]: score,
			[F.feedback.heardFrom]: values.heardFrom,
			[F.feedback.doingWell]: values.doingWell,
			[F.feedback.doBetter]: values.doBetter,
			[F.feedback.otherFeedback]: values.otherFeedback,
			[F.feedback.currentStreak]: participant ? (p[F.participants.currentStreak] ?? 0) : null,
			[F.feedback.daysCompleted]: participant ? (p[F.participants.daysCompleted] ?? 0) : null,
			[F.feedback.submittedAt]: new Date().toISOString()
		};
		// One response per signed-in person: answering again replaces the last one.
		const existing = slackId ? await findFeedback(slackId) : null;
		if (existing) await airtable.update(FEEDBACK_TABLE, existing.id, record);
		else await airtable.create(FEEDBACK_TABLE, record);
		return { success: true };
	}
};
