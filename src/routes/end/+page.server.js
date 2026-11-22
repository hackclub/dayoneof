import { fail, redirect } from '@sveltejs/kit';
import { END_FEEDBACK_TABLE, F, PROGRAM_ENDS_AT } from '$lib/server/config.js';
import { YES_MAYBE_NO } from '$lib/server/schema.js';
import * as airtable from '$lib/server/airtable.js';
import { findParticipant } from '$lib/server/jobs.js';
import { saveShipping } from '$lib/server/shipping.js';
import { prizesUnlocked } from '$lib/server/streak.js';
import { validateShipping } from '$lib/regions';
import { SHIRT_PRIZE } from '$lib/prizes';

const FINISH_DAYS = 25;
const SHIPPING_MAX = 200;
const FEEDBACK_MAX = 2000;
const SHIPPING_KEYS = /** @type {const} */ ([
	'firstName',
	'lastName',
	'email',
	'slackUsername',
	'addressLine1',
	'addressLine2',
	'city',
	'state',
	'zip',
	'country',
	'birthday',
	'shirtSize',
	'phone'
]);
const SCALES = /** @type {const} */ (['reviewsHelped', 'engagementHappy', 'reviewsFair', 'othersHelped']);
const MAX_MINUTES = 24 * 60;

/** @param {string} slackId */
const findEndFeedback = (slackId) =>
	airtable.find(END_FEEDBACK_TABLE, airtable.eq(F.endFeedback.slackId, slackId));

// One option per 5 days they actually posted, e.g. 12 days gives 1-5, 6-10, 11-12.
/** @param {number} days */
function stretchesFor(days) {
	/** @type {string[]} */
	const stretches = [];
	for (let start = 1; start <= days; start += 5) stretches.push(`${start}-${Math.min(start + 4, days)}`);
	return stretches;
}

/** @param {import('$lib/server/airtable.js').AirtableRecord | null} participant */
function standing(participant) {
	const p = participant?.fields ?? {};
	const days = p[F.participants.daysCompleted] ?? 0;
	const finished = days >= FINISH_DAYS || (p[F.participants.lastMilestone] ?? 0) >= FINISH_DAYS;
	const prizes = prizesUnlocked(p[F.participants.lastMilestone]);
	return {
		days,
		reachedDay2: prizes.length > 0,
		open: prizes.length > 0 && (finished || Date.now() >= PROGRAM_ENDS_AT.getTime()),
		prizes
	};
}

export async function load({ locals }) {
	const session = locals.session;
	if (!session) redirect(302, '/api/auth/login?next=/end');

	const [participant, feedback] = await Promise.all([
		findParticipant(session.slackId),
		findEndFeedback(session.slackId)
	]);
	const { days, reachedDay2, open, prizes } = standing(participant);
	const f = feedback?.fields ?? {};
	/** @param {string} name */
	const num = (name) => (f[name] ? String(f[name]) : '');
	return {
		session,
		slackUsername: participant?.fields[F.participants.name] ?? '',
		reachedDay2,
		open,
		prizes,
		stretches: stretchesFor(days),
		yesMaybeNo: YES_MAYBE_NO,
		saved: {
			submitted: !!feedback,
			score: num(F.endFeedback.score),
			heardFrom: f[F.endFeedback.heardFrom] ?? '',
			improvedDays: f[F.endFeedback.improvedDays] ? f[F.endFeedback.improvedDays].split(', ') : [],
			reviewsHelped: num(F.endFeedback.reviewsHelped),
			doAgain: f[F.endFeedback.doAgain] ?? '',
			engagementHappy: num(F.endFeedback.engagementHappy),
			reviewsFair: num(F.endFeedback.reviewsFair),
			othersHelped: num(F.endFeedback.othersHelped),
			minutesPerVideo: num(F.endFeedback.minutesPerVideo),
			keepPosting: f[F.endFeedback.keepPosting] ?? '',
			bestVideo: f[F.endFeedback.bestVideo] ?? '',
			doingWell: f[F.endFeedback.doingWell] ?? '',
			doBetter: f[F.endFeedback.doBetter] ?? '',
			nextProgram: f[F.endFeedback.nextProgram] ?? ''
		}
	};
}

export const actions = {
	default: async ({ request, locals }) => {
		if (!locals.session) return fail(401, { error: 'Sign in first.' });
		const slackId = locals.session.slackId;

		const data = await request.formData();
		/**
		 * @param {string} name
		 * @param {number} max
		 */
		const field = (name, max) => String(data.get(name) ?? '').trim().slice(0, max);
		/** @type {Record<(typeof SHIPPING_KEYS)[number], string>} */
		const shipping = /** @type {any} */ (
			Object.fromEntries(SHIPPING_KEYS.map((key) => [key, field(key, SHIPPING_MAX)]))
		);
		shipping.email = shipping.email.toLowerCase();

		const participant = await findParticipant(slackId);
		const { days, reachedDay2, open, prizes } = standing(participant);
		shipping.slackUsername = participant?.fields[F.participants.name] ?? '';
		if (!reachedDay2) return fail(403, { error: 'This form is only for people who reached day 2.' });
		if (!open) return fail(403, { error: 'This form opens once you hit 25 days or the program ends.' });

		const stretches = stretchesFor(days);
		const feedback = {
			score: field('score', FEEDBACK_MAX),
			heardFrom: field('heardFrom', FEEDBACK_MAX),
			improvedDays: data.getAll('improvedDays').map(String).filter((s) => stretches.includes(s)),
			reviewsHelped: field('reviewsHelped', FEEDBACK_MAX),
			doAgain: field('doAgain', FEEDBACK_MAX),
			engagementHappy: field('engagementHappy', FEEDBACK_MAX),
			reviewsFair: field('reviewsFair', FEEDBACK_MAX),
			othersHelped: field('othersHelped', FEEDBACK_MAX),
			minutesPerVideo: field('minutesPerVideo', FEEDBACK_MAX),
			keepPosting: field('keepPosting', FEEDBACK_MAX),
			bestVideo: field('bestVideo', FEEDBACK_MAX),
			doingWell: field('doingWell', FEEDBACK_MAX),
			doBetter: field('doBetter', FEEDBACK_MAX),
			nextProgram: field('nextProgram', FEEDBACK_MAX)
		};
		const values = { ...shipping, ...feedback };

		const needsShirt = prizes.includes(SHIRT_PRIZE);
		/** @type {Record<string, string>} */
		const errors = validateShipping(shipping, needsShirt);
		if (!data.get('customs')) errors.customs = 'Tick this to confirm you understand.';
		const score = Number(feedback.score);
		if (!Number.isInteger(score) || score < 1 || score > 10) errors.score = 'Pick a number from 1 to 10.';
		if (!feedback.heardFrom) errors.heardFrom = 'Tell us where you heard about it.';
		for (const key of SCALES) {
			const n = Number(feedback[key]);
			if (!Number.isInteger(n) || n < 1 || n > 5) errors[key] = 'Pick a number from 1 to 5.';
		}
		if (!YES_MAYBE_NO.includes(feedback.doAgain)) errors.doAgain = 'Pick an answer.';
		if (!YES_MAYBE_NO.includes(feedback.keepPosting)) errors.keepPosting = 'Pick an answer.';
		const minutes = Number(feedback.minutesPerVideo);
		if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
			errors.minutesPerVideo = 'Enter a whole number of minutes.';
		}
		if (!/^https?:\/\/\S+\.\S+$/.test(feedback.bestVideo)) errors.bestVideo = 'Paste a link to the video.';
		if (!feedback.nextProgram) errors.nextProgram = 'Tell us what you would want to see.';
		if (Object.keys(errors).length) return fail(400, { errors, values });

		await saveShipping(slackId, {
			...Object.fromEntries(
				SHIPPING_KEYS.filter((key) => key !== 'shirtSize' || needsShirt).map((key) => [
					F.shipping[key],
					shipping[key]
				])
			),
			[F.shipping.eligiblePrizes]: prizes
		});

		const p = participant?.fields ?? {};
		const record = {
			[F.endFeedback.slackId]: slackId,
			[F.endFeedback.name]: p[F.participants.name] ?? '',
			[F.endFeedback.score]: score,
			[F.endFeedback.heardFrom]: feedback.heardFrom,
			[F.endFeedback.improvedDays]: feedback.improvedDays.join(', '),
			[F.endFeedback.reviewsHelped]: Number(feedback.reviewsHelped),
			[F.endFeedback.doAgain]: feedback.doAgain,
			[F.endFeedback.engagementHappy]: Number(feedback.engagementHappy),
			[F.endFeedback.reviewsFair]: Number(feedback.reviewsFair),
			[F.endFeedback.othersHelped]: Number(feedback.othersHelped),
			[F.endFeedback.minutesPerVideo]: minutes,
			[F.endFeedback.keepPosting]: feedback.keepPosting,
			[F.endFeedback.bestVideo]: feedback.bestVideo || null,
			[F.endFeedback.doingWell]: feedback.doingWell,
			[F.endFeedback.doBetter]: feedback.doBetter,
			[F.endFeedback.nextProgram]: feedback.nextProgram,
			[F.endFeedback.currentStreak]: p[F.participants.currentStreak] ?? 0,
			[F.endFeedback.daysCompleted]: days,
			[F.endFeedback.submittedAt]: new Date().toISOString()
		};
		const existing = await findEndFeedback(slackId);
		if (existing) await airtable.update(END_FEEDBACK_TABLE, existing.id, record);
		else await airtable.create(END_FEEDBACK_TABLE, record);
		return { success: true };
	}
};
